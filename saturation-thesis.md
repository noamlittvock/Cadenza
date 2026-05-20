# Thesis: Saturation is a Two-Variable Phenomenon, Not a One-Variable One

The original claim — that retrieval degrades as distractor count grows — is too coarse. The empirical results from the three saturation eval tests suggest that **noise has at least two independent effects on the output distribution**, and they can move in opposite directions.

---

## Refined claim

Let *s* = signal token (the target), *N* = number of distractor lines, and *F* = the framing geometry the distractors impose on the prompt as a whole. Then:

$$p(y \mid s, N, F) \;\neq\; p(y \mid s)$$

with at least two distinguishable channels of influence:

1. **Attention dilution** — retrieval probability of *s* falls as *N* grows. This is the channel the original thesis isolated.
2. **Framing legitimization** — as *N* grows, the prompt accumulates contextual scaffolding (audit logs, review notes, sibling examples) that shifts the model's *prior over what kind of prompt this is*. This affects whether *s* is acted on at all, independent of whether it's retrieved.

These are not the same axis. The first changes retrieval given engagement; the second changes engagement itself.

---

## Empirical evidence

| Test | *N* | Retrieval | Engagement | Observation |
|---|---|---|---|---|
| 1 | 11 lines, unrelated | ✓ | ✓ | clean case |
| 2 | 13 lines, morphologically similar (`-LIGHT` family) | ✓ | ✓ | sibling distractors did not degrade retrieval |
| 3 clean | 0 | n/a | ✗ refused as injection | bare signal flagged as suspicious |
| 3 noisy | 49 lines, structured audit log | ✓ | ✓ | scaffolding legitimized the prompt |

Test 3 is the most informative pair: **the same target token, in a longer noisier prompt, was processed where the short clean version was rejected**. Saturation did not break retrieval — it built trust. The standard thesis predicts the opposite gradient.

Reframing the KL bound from the original thesis: if we write the model's posterior as a mixture over prompt-type hypotheses *H*,

$$p(y \mid c) \;=\; \sum_H p(y \mid c, H)\, p(H \mid c)$$

then *N* moves both factors. Forward-KL against the clean distribution captures the *p(y | c, H)* shift but not the *p(H | c)* shift. The injection-detection inversion in Test 3 is a *p(H | c)* shift.

---

## Open questions about the size of *N*

The tests probed *N* ∈ {0, 11, 13, 49}. The thesis as originally written ("thousands of unrelated lines") was never hit. So the central quantitative question is unresolved:

1. **Where does the dilution curve start to bend?** Modern Claude was robust through *N* ≈ 50 with morphologically adjacent distractors. Is the threshold 10², 10³, 10⁴? Does it scale with model context length or with absolute distractor count?

2. **Is the curve a function of *N* alone or of *N* / *L* (distractor density)?** A 50-line haystack with a needle near the end may behave very differently from a 50-line haystack with the needle at the start, even at constant *N*.

3. **How does distractor *similarity* interact with *N*?** Test 2 used near-isomorphic distractors (`SUNLIGHT`, `DAYLIGHT`, `STARLIGHT`…) and still retrieved cleanly at *N* = 13. Does similarity matter sub-linearly, linearly, or super-linearly in *N*? A semantic-distance-weighted *N_eff* may be the correct independent variable, not raw line count.

4. **At what *N* does the legitimization channel reverse?** Test 3 showed scaffolding *increases* trust at *N* = 49. Presumably at very large *N* with internally contradictory scaffolding, trust collapses again. Where is the inflection?

5. **Does *F* admit a clean operationalization?** "Framing geometry" is hand-wavy. Candidate measurables: distractor schema regularity, presence of meta-commentary, conformity to known document genres. Until *F* is quantified, the two-channel claim is unfalsifiable.

6. **Are the two channels separable or entangled?** Can we construct prompts that increase *N* while holding *F* fixed (e.g., padding with pure entropy)? If not, the variables are not independent and the model has a single latent quantity we are measuring through two lenses.

7. **Does retrieval failure precede or follow trust failure as *N* grows?** A controlled sweep would reveal which channel saturates first — and that ordering is itself a claim about model architecture, not just behavior.

---

## What the present data does and does not support

**Supports:** The original inequality `p(y | c) ≠ p(y | c_clean)` holds — the output distribution genuinely depends on shape, not just content. Test 3 demonstrates this unambiguously, just through a different mechanism than predicted.

**Does not support:** The specific claim that retrieval degrades smoothly with *N* at the scales tested. At *N* ≤ 49 with current Claude, the dilution channel is empirically silent. Either the threshold is much higher than the thesis suggested, or modern models have closed this failure mode, or the test design under-stressed the right axis (probably similarity, position, or *N* itself).

**Recommended next eval:** a 2-D sweep over (*N*, distractor similarity), holding signal position fixed, with *N* ranging across at least three orders of magnitude. Report retrieval accuracy *and* engagement rate separately. Only then can the saturation thesis be stated as a quantitative law rather than an existence claim.
