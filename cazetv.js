/**
 * cazetv.js – Links das transmissões ao vivo da CazeTV por jogo.
 * Chave = parte do nome do time da casa em inglês (como retorna a API).
 */
export const CAZETV_MAP = {
  "Canada":        "https://www.youtube.com/watch?v=CRtjePKnGvA",
  "United States": "https://www.youtube.com/watch?v=7EFTDmwcleI",
  "Qatar":         "https://www.youtube.com/watch?v=ljah6d9m7Z0",
  "Brazil":        "https://www.youtube.com/watch?v=vC3fV_awcWE",
  "Haiti":         "https://www.youtube.com/watch?v=yBUg81qhrNo",
  "Australia":     "https://www.youtube.com/watch?v=8rr-857IbHA",
  "Germany":       "https://www.youtube.com/watch?v=byP1peOCkzI",
  "Netherlands":   "https://www.youtube.com/watch?v=6Ca_GzyVOs0",
  "Ivory Coast":   "https://www.youtube.com/watch?v=IFh8Nuuhgcc",
  "Sweden":        "https://www.youtube.com/watch?v=o2wC007Jp-A",
  "Spain":         "https://www.youtube.com/watch?v=EYStZQ5FsVk",
  "Belgium":       "https://www.youtube.com/watch?v=aclBHrhLQr4",
};

/**
 * Retorna o link da CazeTV para o jogo pelo nome do time da casa.
 * Retorna null se não encontrado.
 */
export function getCazeTVLink(homeName) {
  if (!homeName) return null;
  const entry = Object.entries(CAZETV_MAP).find(([k]) => homeName.includes(k));
  return entry ? entry[1] : null;
}
