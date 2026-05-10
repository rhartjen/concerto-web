import Canvas            from '../components/Canvas';
import DrawingPanel      from '../components/DrawingPanel';
import OnboardingOverlay from '../components/OnboardingOverlay';

export default function CanvasScreen() {
  return (
    <>
      <Canvas />
      <DrawingPanel />
      <OnboardingOverlay />
    </>
  );
}
