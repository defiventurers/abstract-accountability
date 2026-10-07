export function receiptShareText(days, url) {
  return days.toLocaleString('en-US') + ' days since my first recorded Abstract interaction. I gave @AbstractChain my time and trust.\n\nI no longer trust @LucaNetz or @pudgypenguins with my time. Never bite a hand that feeds you.\n\nSee your first day + days you gave → ' + url + '\nIgloo reports an eight-figure loss. Our prime years cost more—and we can’t buy them back.';
}
export async function shareReceipt(data, capabilities, actions) {
  let supportsFiles = false;
  try { supportsFiles = !!data.file && !!capabilities.share && !!capabilities.canShare?.({files:[data.file]}); } catch {}
  if (supportsFiles) {
    try {
      // Called before any await, preserving the click's transient activation.
      await capabilities.share({files:[data.file], text:data.text, title:'My Abstract time receipt'});
      return 'shared';
    } catch (error) { return error?.name === 'AbortError' ? 'cancelled' : 'failed'; }
  }
  if (data.file) actions.download(data.file);
  actions.openDraft(data.text);
  return data.file ? 'downloaded' : 'text-only';
}
