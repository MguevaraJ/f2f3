/** The local zero-shot model. Only its vision half is downloaded by users. */
export const LOCAL_MODEL = {
  id: 'Xenova/clip-vit-base-patch32',
  // fp16: the 8-bit quantised variant lost too much accuracy in testing (e.g. a pig at
  // the crosshair dropped from 68% to 30%); fp16 matches fp32 at half the size.
  dtype: 'fp16' as const,
  /** Shown to users before downloading. */
  approxMB: 170,
  inputSize: 224,
  mean: [0.48145466, 0.4578275, 0.40821073],
  std: [0.26862954, 0.26130258, 0.27577711]
}
