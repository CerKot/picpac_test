import {studioProfile} from '../dist/document-studio-profile.js';

export const DOCUMENT_STUDIO_PROMPT_VERSION = 'studio-portrait-v2';

export function documentStudioPrompt(docId) {
  const profile = studioProfile(docId);
  if (!profile) return null;
  return [
    'Edit the one uploaded photograph into a realistic studio headshot preview. The source photo is the only reference for the person. Keep the exact same person, facial proportions, expression, gaze, age, skin tone, texture, asymmetry, moles, scars, hairline, hairstyle, eyes, eyewear and clothing. Do not regenerate, smooth, beautify, sharpen artificially or replace any facial feature.',
    'Use one perfectly uniform, flat neutral color (' + profile.background + ') for every visible background pixel, including the corners and the entire area above the head. No gradient, vignette, texture, light spots, room details or objects.',
    'Gently balance the existing shadows as if using diffuse frontal light. All lighting equipment stays outside the frame. No visible lamps, softboxes, bright circles, halos, cast shadows, colored light or beauty retouching. Preserve natural color and detail.',
    'Portrait frame ' + profile.ratio + ', head and upper shoulders. Center the head horizontally, with the full crown, chin and upper shoulders visible and a small clear gap above the hair. Eyes look straight into the lens and are on a level line; keep the original neutral expression and lips at rest. Reframe and level with a rigid whole-image transform only. Do not invent a new angle, pose, ears, shoulders or any missing parts.',
    'Return exactly one natural photograph without text, document graphics, collage, borders, frames, watermarks or extra people.',
  ].join('\n');
}
