// Settings sections. Plain module (not 'use client') so the server page can validate the URL:
// a constant imported from a client module is only a reference on the server.
export type SettingsSection = 'profile' | 'training' | 'privacy' | 'box' | 'boxes' | 'athletic' | 'appearance' | 'notifications' | 'security'

export const SECTION_TITLE: Record<SettingsSection, string> = {
  profile: 'Perfil', training: 'Entrenamiento', privacy: 'Privacidad', box: 'Mi box', boxes: 'Mis boxes',
  athletic: 'Perfil atlético', appearance: 'Apariencia', notifications: 'Avisos', security: 'Cuenta y seguridad',
}
