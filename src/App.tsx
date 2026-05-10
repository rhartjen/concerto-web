import { BrowserRouter, Routes, Route } from 'react-router-dom';
import CanvasScreen       from './screens/CanvasScreen';
import ChordSheetScreen   from './screens/ChordSheetScreen';
import DiscoverScreen     from './screens/DiscoverScreen';
import SharedCanvasScreen from './screens/SharedCanvasScreen';
import Toast              from './components/Toast';
import UsernameModal      from './components/UsernameModal';
import AdminScreen        from './screens/AdminScreen';

export default function App() {
  return (
    <BrowserRouter>
      <UsernameModal />
      <Routes>
        <Route path="/"         element={<CanvasScreen />} />
        <Route path="/chords"   element={<ChordSheetScreen />} />
        <Route path="/discover" element={<DiscoverScreen />} />
        <Route path="/s/:slug"  element={<SharedCanvasScreen />} />
        <Route path="/admin"    element={<AdminScreen />} />
      </Routes>
      <Toast />
    </BrowserRouter>
  );
}
