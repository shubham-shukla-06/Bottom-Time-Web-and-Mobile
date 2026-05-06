import { Navigate } from 'react-router-dom';

// Destinations content is now integrated into the Discover page
export default function Destinations() {
  return <Navigate to="/discover" replace />;
}
