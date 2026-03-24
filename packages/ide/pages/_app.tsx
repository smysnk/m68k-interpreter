import type { AppProps } from 'next/app';
import 'react-retro-display-tty-ansi/styles.css';
import '../src/styles/main.css';

export default function IdeApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
