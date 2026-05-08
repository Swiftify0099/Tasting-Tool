import { HashRouter } from 'react-router-dom';
import AppRouter from './router/AppRouter';
import { FlowProvider } from './context/FlowContext';
import { DOMProvider } from './context/DOMContext';

export default function App() {
  return (
    <HashRouter>
      <FlowProvider>
        <DOMProvider>
          <AppRouter />
        </DOMProvider>
      </FlowProvider>
    </HashRouter>
  );
}
