// Phase B (web passkeys) — post-login enrollment dialog.
//
// A controlled <AlertDialog> mounted once at the App root and toggled by
// the tiny `usePasskeyEnrollPromptStore` Zustand store (see
// ./passkeyEnrollPrompt.js). Shown after a successful non-passkey login
// when the user has no passkey on the server AND/OR no
// `bt_passkey_device_id` flag on this device.

import { useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from './ui/alert-dialog';
import { registerPasskey, setPasskeyOnDeviceFlag } from '../api/webauthnClient';
import { usePasskeyEnrollPromptStore } from './auth/passkeyEnrollPrompt';

export default function PasskeyEnrollDialog() {
  const open = usePasskeyEnrollPromptStore((s) => s.open);
  const hide = usePasskeyEnrollPromptStore((s) => s.hide);
  const [enrolling, setEnrolling] = useState(false);

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      const result = await registerPasskey();
      setPasskeyOnDeviceFlag(result?.credentialId);
      toast.success(`Passkey added: ${result.label || 'passkey'}`);
      hide();
    } catch (err) {
      const name = err?.name || '';
      // User cancelled the system prompt — close silently so they aren't nagged.
      if (name === 'NotAllowedError' || name === 'AbortError') {
        hide();
      } else {
        const msg = err?.response?.data?.detail || err?.message || 'Could not set up passkey';
        toast.error(typeof msg === 'string' ? msg : 'Could not set up passkey');
      }
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) hide(); }}>
      <AlertDialogContent data-testid="passkey-enroll-dialog">
        <AlertDialogHeader>
          <div className="w-12 h-12 rounded-full bg-cyan-50 text-cyan-500 flex items-center justify-center mb-3">
            <Fingerprint size={22} />
          </div>
          <AlertDialogTitle>Enroll a passkey</AlertDialogTitle>
          <AlertDialogDescription>
            Add a passkey to this device for faster, password-free sign-in next time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={enrolling}
            onClick={hide}
            data-testid="passkey-enroll-skip"
          >
            Skip for now
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={enrolling}
            onClick={handleEnroll}
            data-testid="passkey-enroll-confirm"
          >
            {enrolling ? 'Setting up…' : 'Enroll passkey'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
