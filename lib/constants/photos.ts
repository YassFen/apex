// Free photos (Unsplash License) for the welcome and auth screens, served from Unsplash's CDN.
const u = (id: string, w = 1400) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`

export const WELCOME_SLIDES = [
  { src: u('photo-1517838277536-f5f99be501cd'), title: 'Tu box, en tu bolsillo', body: 'El WOD del día aparece apenas tu coach lo publica, con la hora de tu clase.' },
  { src: u('photo-1639660299469-9e9279364c97'), title: 'Cada récord cuenta', body: 'Tus RMs, tu progreso y cuánto cargar en la barra, en kilos o libras.' },
  { src: u('photo-1534368959876-26bf04f2c947'), title: 'Llega listo a competir', body: 'Tu calendario de competencias y qué tan preparado vas para cada workout.' },
  { src: u('photo-1513352098199-8ccf457b35a8'), title: 'Entrena con tu comunidad', body: 'Ranking en vivo del WOD y fuego para tus compañeros de box.' },
]

export const AUTH_PHOTO = u('photo-1517838277536-f5f99be501cd', 1600)
