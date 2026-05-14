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
import { usePasskeyEnrollPromptStore, setNeverAskAgain, clearNeverAskFlag } from './auth/passkeyEnrollPrompt';

export default function PasskeyEnrollDialog() {
  const open = usePasskeyEnrollPromptStore((s) => s.open);
  const hide = usePasskeyEnrollPromptStore((s) => s.hide);
  const [enrolling, setEnrolling] = useState(false);

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      const result = await registerPasskey();
      setPasskeyOnDeviceFlag(result?.credentialId);
      clearNeverAskFlag();
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
          {/* Centred icon — wrapped in a justify-center flex so it
              sits above a centred title block rather than top-left. */}
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-cyan-50 text-cyan-500 flex items-center justify-center">
              <Fingerprint size={22} />
            </div>
          </div>
          <AlertDialogTitle className="text-center">Enroll a passkey</AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            Add a passkey to this device for faster, password-free sign-in next time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex justify-center gap-3 sm:justify-center">
          <button
            type="button"
            disabled={enrolling}
            onClick={() => { setNeverAskAgain(); hide(); }}
            data-testid="passkey-enroll-never"
            className="rounded-full px-4 py-2 text-sm border border-cyan-500 text-cyan-700 bg-white hover:bg-cyan-50 mt-0"
          >
            Skip forever
          </button>
          <AlertDialogCancel
            disabled={enrolling}
            onClick={hide}
            data-testid="passkey-enroll-skip"
            className="rounded-full px-4 py-2 text-sm border border-cyan-500 text-cyan-700 bg-white hover:bg-cyan-50 mt-0"
          >
            Skip for now
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={enrolling}
            onClick={handleEnroll}
            data-testid="passkey-enroll-confirm"
            className="rounded-full px-4 py-2 text-sm bg-cyan-500 hover:bg-cyan-600 text-white border-0 shadow-sm"
          >
            {enrolling ? 'Setting up…' : 'Enroll passkey'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
