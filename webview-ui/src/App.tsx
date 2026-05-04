import { HashRouter } from 'react-router-dom';
import AppRouter from './router/AppRouter';
import { FlowProvider } from './context/FlowContext';

export default function App() {
  return (
    <HashRouter>
      <FlowProvider>
        <AppRouter />
      </FlowProvider>
    </HashRouter>
  );
}
