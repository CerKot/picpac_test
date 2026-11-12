export const DOCUMENT_STUDIO_OPERATION = 'document.studio.preview';

// These are visual targets for a studio preview, not government specifications.
const profiles = Object.freeze({
  by: Object.freeze({ratio: '4:5', background: '#F5F5F5'}),
  schengen: Object.freeze({ratio: '7:9', background: '#FFFFFF'}),
  residence: Object.freeze({ratio: '7:9', background: '#F5F5F5'}),
});

export const studioProfile = id => Object.hasOwn(profiles, id) ? profiles[id] : null;
