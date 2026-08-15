import { createRoot } from 'react-dom/client';
import 'react-retro-display-tty-ansi-ascii/styles.css';
import './styles/main.css';
import App from './components/App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Unable to start the M68K IDE: #root was not found.');
}

createRoot(rootElement).render(<App />);
