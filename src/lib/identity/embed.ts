// Face detection and descriptors in the browser (spec: Identity match score).
// face-api and TensorFlow.js load on first use, in their own chunk, with the
// weights from public/models. Nothing here leaves the device.
import type * as FaceApi from "@vladmandic/face-api";
import type { PhotoQuality } from "@/lib/characters/draft";
import type { Point } from "./pose";

type FaceApiModule = typeof FaceApi;

export const FACE_MODEL = "face-api 1.7.15 ssd_mobilenetv1 face_recognition";

// Photo intake rules (spec: Create from photos).
export const MIN_PHOTO_FACE_PX = 160;
// Faces at least this share of the largest one's height count as another person.
const SECOND_FACE_SHARE = 0.35;
// Variance of the Laplacian on a 256 px face crop; under this is heavy blur.
export const BLUR_MIN = 20;

let loading: Promise<FaceApiModule> | null = null;

export function loadFaceApi(): Promise<FaceApiModule> {
  loading ??= (async () => {
    const faceapi = await import("@vladmandic/face-api");
    // The bundled TensorFlow.js has these at runtime; face-api's types leave them out.
    const tf = faceapi.tf as unknown as { setBackend(name: string): Promise<boolean>; ready(): Promise<void> };
    if (!(await tf.setBackend("webgl").catch(() => false))) await tf.setBackend("cpu");
    await tf.ready();
    const url = `${import.meta.env.BASE_URL}models`;
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(url),
      faceapi.nets.tinyFaceDetector.loadFromUri(url),
      faceapi.nets.faceLandmark68Net.loadFromUri(url),
      faceapi.nets.faceRecognitionNet.loadFromUri(url),
      faceapi.nets.faceExpressionNet.loadFromUri(url),
    ]);
    return faceapi;
  })().catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedFace {
  box: Box;
  descriptor: number[];
  landmarks: Point[];
  confidence: number;
}

type Input = HTMLCanvasElement | HTMLImageElement | HTMLVideoElement;

function boxOf(b: { x: number; y: number; width: number; height: number }): Box {
  return { x: b.x, y: b.y, width: b.width, height: b.height };
}

// Every face at least minHeight tall, largest first.
export async function detectFaces(input: Input, minHeight = 80): Promise<DetectedFace[]> {
  const faceapi = await loadFaceApi();
  const results = await faceapi
    .detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  return results
    .filter((r) => r.detection.box.height >= minHeight)
    .sort((a, b) => b.detection.box.height - a.detection.box.height)
    .map((r) => ({
      box: boxOf(r.detection.box),
      descriptor: Array.from(r.descriptor),
      landmarks: r.landmarks.positions.map((p) => ({ x: p.x, y: p.y })),
      confidence: r.detection.score,
    }));
}

// Sharpness of a face: variance of a 3x3 Laplacian over a greyscale crop
// scaled to 256 px tall, so photos of any size compare.
export function sharpness(source: HTMLCanvasElement, box: Box): number {
  const h = 256;
  const w = Math.max(1, Math.round((box.width / box.height) * h));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const grey = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) grey[i] = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = grey[i - w]! + grey[i + w]! + grey[i - 1]! + grey[i + 1]! - 4 * grey[i]!;
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

// Whether an image shows a person's face at all (any face 60 px or taller).
export async function hasFace(image: HTMLCanvasElement): Promise<boolean> {
  return (await detectFaces(image, 60)).length > 0;
}

export interface PhotoCheck {
  quality: PhotoQuality;
  descriptor?: number[];
  faceHeight?: number;
}

// The intake check for one prepared photo (spec: Create from photos, step 1).
export async function checkPhoto(photo: HTMLCanvasElement): Promise<PhotoCheck> {
  const faces = await detectFaces(photo, 0);
  const main = faces[0];
  if (!main) return { quality: "no-face" };
  if (faces.slice(1).some((f) => f.box.height >= main.box.height * SECOND_FACE_SHARE)) return { quality: "several-faces" };
  if (main.box.height < MIN_PHOTO_FACE_PX) return { quality: "small-face", faceHeight: main.box.height };
  if (sharpness(photo, main.box) < BLUR_MIN) return { quality: "blurry", faceHeight: main.box.height };
  return { quality: "good", descriptor: main.descriptor, faceHeight: main.box.height };
}

export interface VideoFrame {
  faceCount: number;
  landmarks?: Point[];
  happy?: number;
  descriptor?: number[];
}

// One webcam frame for the consent check: the fast detector every frame, a
// descriptor only when asked (it costs the most).
export async function sampleVideoFrame(video: HTMLVideoElement, withDescriptor: boolean): Promise<VideoFrame> {
  const faceapi = await loadFaceApi();
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
  if (withDescriptor) {
    const results = await faceapi.detectAllFaces(video, options).withFaceLandmarks().withFaceExpressions().withFaceDescriptors();
    const main = results[0];
    return {
      faceCount: results.length,
      ...(main ? { landmarks: main.landmarks.positions.map((p) => ({ x: p.x, y: p.y })), happy: main.expressions.happy, descriptor: Array.from(main.descriptor) } : {}),
    };
  }
  const results = await faceapi.detectAllFaces(video, options).withFaceLandmarks().withFaceExpressions();
  const main = results[0];
  return {
    faceCount: results.length,
    ...(main ? { landmarks: main.landmarks.positions.map((p) => ({ x: p.x, y: p.y })), happy: main.expressions.happy } : {}),
  };
}
