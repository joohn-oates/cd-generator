// Shiny-side colours, based on the dye and reflective layer used in real discs.
// `color` tints the metal reflection; the rainbow streaks are tinted toward the dye too.

export const DISC_TYPES = [
  {
    id: 'pressed',
    name: 'Pressed CD',
    layer: 'Aluminium',
    color: '#edf2f7',
    about: 'Factory-pressed music/software CD. No dye, just bare aluminium: bright silver.',
  },
  {
    id: 'phthalo-silver',
    name: 'Phthalocyanine',
    layer: 'Silver',
    color: '#dfe9cf',
    about: 'The most common CD-R dye. Very pale green over silver; reads almost silver.',
  },
  {
    id: 'phthalo-gold',
    name: 'Phthalocyanine',
    layer: 'Gold',
    color: '#f6d47c',
    about: 'Pale dye over a gold layer gives the classic premium "gold CD-R".',
  },
  {
    id: 'cyanine-silver',
    name: 'Cyanine',
    layer: 'Silver',
    color: '#7fc2f2',
    about: 'Cyan-blue dye over silver. A light-to-mid blue disc.',
  },
  {
    id: 'cyanine-gold',
    name: 'Cyanine',
    layer: 'Gold',
    color: '#8ccf8f',
    about: 'Cyanine over a gold layer looks green.',
  },
  {
    id: 'azo-silver',
    name: 'Azo',
    layer: 'Silver',
    color: '#3552b0',
    about: 'Deep blue Azo dye over silver. Dark dye usually meant a higher quality disc.',
  },
  {
    id: 'azo-gold',
    name: 'Azo',
    layer: 'Gold',
    color: '#2f6e4c',
    about: 'Azo over a gold layer reads as a dark green.',
  },
  {
    id: 'dvd-r',
    name: 'DVD-R',
    layer: 'Silver',
    color: '#7653a8',
    about: 'Recordable DVDs are almost always purple.',
  },
  {
    id: 'custom',
    name: 'Custom',
    layer: '',
    color: null,
    about: 'Pick any colour for the shiny side.',
  },
];

export function discType(id) {
  return DISC_TYPES.find((t) => t.id === id) || DISC_TYPES[0];
}

// Shiny-side colour for a design: the preset's colour, or the custom tint.
export function discColor(design) {
  const t = discType(design.discType);
  return t.color || design.tint;
}
