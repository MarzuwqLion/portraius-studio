# Identity score calibration (Unknowns row 13)

Run on October 19, early (it's an M5 task), because the Image studio's acceptance row depends on it.

## Set-up

Five clearly different designed people (a woman in her twenties with a shaved head; a man in his
forties with East Asian features and glasses; a woman in her sixties with curly red-grey hair; a bearded
man in his thirties; a woman in her fifties with a long braid). For each: one 1K portrait as the
reference, then four 1K scenes (market, desk, rooftop at night, dinner table) drawn with the portrait as
the reference image, the same way the Image studio draws a cast member. Distances are face-api
descriptors, scene against portrait.

The Comfy workspace ran out of credits partway through, so 15 of the 20 scenes landed: 15 same-person
and 15 different-person pairs (each scene against the next person's portrait), plus all 60 cross-person
pairs.

## Results

| Pairs | Distances |
| --- | --- |
| Same person (15) | 0.273, 0.337, 0.357, 0.364, 0.388, 0.392, 0.396, 0.397, 0.401, 0.411, 0.415, 0.453, 0.504, 0.546, 0.730 |
| Different person, next portrait (15) | 0.768 to 0.942 |
| Different person, all 60 cross pairs | closest 0.584, 0.624, 0.682, 0.692, 0.756 |

At a threshold of 0.565, the 75 pairs give one error (the 0.730 outlier). **Row 13 holds: face-api
separates different generated people**, so the score stays on face-api. The full 20 plus 20 run needs
five more scenes once credits are back.

## Constants

`DISTANCE_PERFECT = 0.40` and `DISTANCE_ZERO = 0.90` (were 0.35 and 0.75). Then 0.50 scores 80 and
0.60 scores 60, so the Check band sits in the gap between the two groups.

Walt Harmon's ten diner images, re-scored with the new constants: 88, 90, 89, 73, 90, 96, 95, 91, 90 and
90. That's 9 of 10 at 80 or more, so **the Image studio row passes**. The automatic retry (54 before)
re-scores at 87.

## Limitation

Look-alikes aren't separated. Three different men drawn from Walt's own description (the other candidate
faces in the wizard) sit 0.32 to 0.40 from Walt's reference, closer than his own scene images, so they
would score as a strong match. A designed character drawn from the same words as another can't be told
apart by face-api. The README should say the score measures likeness to the reference, not identity.
