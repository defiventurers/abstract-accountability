export function receiptShareText(days, url, endpoint = 'the wind-down notice') {
  return days.toLocaleString('en-US') + ' calendar days from my first @AbstractChain TX to ' + endpoint + '.\nI no longer trust @LucaNetz or @pudgypenguins.\n\nNever bite a hand that feeds you.\n\nFind out your first txn & days commited to Abstract👇\n' + url + '\n\nOur prime years > Igloo’s reported 8-figure loss.';
}
export async function shareReceipt(data, capabilities, actions) {
  // X's public intent endpoint cannot receive a local file attachment. Open
  // the composer directly during the click, then download the PNG so the user
  // can attach it before posting. This avoids the native share sheet sending
  // the user to an arbitrary target or being swallowed by popup blockers.
  actions.openDraft(data.text);
  if (data.file) {
    actions.download(data.file);
    return 'downloaded';
  }
  return 'text-only';
}
