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
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from './ui/alert-dialog';
import { Button } from './ui/button';
import { registerPasskey, setPasskeyOnDeviceFlag } from '../api/webauthnClient';
import { usePasskeyEnrollPromptStore, setNeverAskAgain, clearNeverAskFlag } from './auth/passkeyEnrollPrompt';

// Shared class tokens — applied identically to all three pills via <Button>,
// so the resolved classList comes from one cn(buttonVariants(...), className)
// pipeline and there is zero layout/font race between them on first paint.
const PILL_OUTLINE = 'rounded-full px-4 py-2 border-cyan-500 text-cyan-700 bg-white hover:bg-cyan-50 hover:text-cyan-700 shadow-none mt-0 sm:mt-0';
const PILL_FILLED  = 'rounded-full px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white border-0 shadow-sm mt-0';

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
      <AlertDialogContent
        data-testid="passkey-enroll-dialog"
        // Suppress Radix's default autofocus into the first focusable
        // descendant. Otherwise AlertDialogCancel ("Skip for now") receives
        // focus(), and because OTP submit via Enter is a keyboard modality,
        // :focus-visible matches → the shadcn buttonVariants' focus ring
        // (box-shadow: 0 0 0 1px ring-ring) paints a 1px halo outside the
        // 1px cyan border, making it visually heavier than the other two
        // pills. Preventing autofocus keeps focus on the dialog content
        // itself (tabindex="-1"), which paints no ring. Users can still Tab
        // to any button for keyboard nav.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Custom header wrapper instead of <AlertDialogHeader>: the
            shared header applies `space-y-2` uniformly to every sibling
            child, which forces an 8 px gap between the icon and the
            title that visually splits them into two groups. Editing
            alert-dialog.jsx is out of scope (other consumers depend on
            its defaults), so we control inter-element spacing locally:
            icon→title 4 px (mb-1) → grouped unit; title→description
            8 px (mt-2) → breathing room. AlertDialogTitle / Description
            primitives are preserved so semantics + Radix
            aria-labelledby / aria-describedby still wire up. */}
        <div className="text-center sm:text-left">
          <div className="flex justify-center mb-1">
            <div className="w-12 h-12 rounded-full bg-cyan-50 text-cyan-500 flex items-center justify-center">
              <Fingerprint size={22} />
            </div>
          </div>
          <AlertDialogTitle className="text-center">Enroll a passkey</AlertDialogTitle>
          <AlertDialogDescription className="text-center mt-2">
            Add a passkey to this device for faster, password-free sign-in next time.
          </AlertDialogDescription>
        </div>
        <AlertDialogFooter className="flex justify-center gap-3 sm:justify-center">
          <AlertDialogAction asChild>
            <Button
              disabled={enrolling}
              onClick={handleEnroll}
              data-testid="passkey-enroll-confirm"
              className={PILL_FILLED}
            >
              {enrolling ? 'Setting up…' : 'Enroll passkey'}
            </Button>
          </AlertDialogAction>
          <AlertDialogCancel asChild>
            <Button
              variant="outline"
              disabled={enrolling}
              onClick={hide}
              data-testid="passkey-enroll-skip"
              className={PILL_OUTLINE}
            >
              Skip for now
            </Button>
          </AlertDialogCancel>
          <Button
            variant="outline"
            disabled={enrolling}
            onClick={() => { setNeverAskAgain(); hide(); }}
            data-testid="passkey-enroll-never"
            className={PILL_OUTLINE}
          >
            Skip forever
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
