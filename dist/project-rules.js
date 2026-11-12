import {documentAuditGate} from './document-quality.js';
export const MIN_ALBUM_PHOTOS = 3;
export function albumProgress(project) {
  const originals = new Set((project.photos || []).filter(photo => !photo.demo && !photo.generated)
    .map(photo => photo.sourceHash || photo.contentHash || photo.originalId || photo.id));
  return {count: originals.size, minimum: MIN_ALBUM_PHOTOS,
    missing: Math.max(0, MIN_ALBUM_PHOTOS - originals.size), ready: originals.size >= MIN_ALBUM_PHOTOS};
}
export function projectReadiness(project) {
  if (!project?.photos?.length) return {ready:false, message:'Сначала добавьте фотографии.'};
  if (project.type === 'docs') return documentAuditGate(project);
  if (project.type === 'books') {
    const progress = albumProgress(project);
    if (!progress.ready) return {...progress, message:`Для альбома нужны минимум 3 разные фотографии из вашей галереи. Добавьте ещё ${progress.missing}.`};
  }
  return {ready:true, message:''};
}
export const documentPolicy = docId => ['us','ru'].includes(docId)
  ? {mode:'original-only',canPrepare:false,canUsePrepared:false,version:'2026-11-12-v2',reason:docId==='us'?'Для визы США сохраняем исходный фон и внешность: только проверка и кадрирование. Снимайте перед белым или светлым фоном.':'Для паспорта РФ сохраняем исходную внешность и фон. Художественная обработка недопустима; снимайте перед белым фоном.'}
  : {mode:'review-required',canPrepare:true,canUsePrepared:false,version:'2026-11-12-v2',reason:'Проверка лица доступна на обычном фоне. Для подачи нужен фон по требованиям ведомства. Дополнительная обработанная копия служит только для сравнения; в заказ передаётся исходный снимок.'};
export function selectedDocumentPhoto(project) {
  return documentPolicy(project.docId).canUsePrepared && project.docUsePrepared && project.docPrepared ? project.docPrepared : project.photos?.[0];
}
