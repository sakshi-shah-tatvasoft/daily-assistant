/** Renders translated text where **words** are bold (lets translators move the bold part within the sentence). */
export default function Rich({ text }: { text: string }) {
  return <>{text.split('**').map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))}</>;
}
