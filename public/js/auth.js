// ============================================================
//  js/auth.js
//  Handles Firebase Auth: Google Sign-In + Email/Password
//  Runs AFTER firebase-init.js (window.fbAuth is available)
//  Controls which screen is visible based on auth state
// ============================================================

(function () {
  'use strict';

  const auth           = window.fbAuth;
  const GoogleProvider = new firebase.auth.GoogleAuthProvider();
  GoogleProvider.setCustomParameters({ prompt: 'select_account' });

  // ─── DOM helpers ───────────────────────────────────────────
  const $id = id => document.getElementById(id);

  const loadingOverlay  = $id('loading-overlay');
  const screenAuth      = $id('screen-auth');
  const btnGoogle       = $id('btn-google-signin');
  const btnEmailAuth    = $id('btn-email-auth');
  const btnToggle       = $id('btn-toggle-mode');
  const inputName       = $id('auth-name');
  const inputEmail      = $id('auth-email');
  const inputPwd        = $id('auth-password');
  const authError       = $id('auth-error');
  const authSuccess     = $id('auth-success');
  const authFormTitle   = $id('auth-form-title');
  const nameRow         = $id('auth-name-row');
  const btnForgotPwd    = $id('btn-forgot-password');

  let isSignUpMode = false;

  // ─── Error helpers ─────────────────────────────────────────
  function showAuthError(msg) {
    authError.textContent = msg;
    authError.classList.remove('hidden');
  }

  function showAuthSuccess(msg) {
    authSuccess.textContent = msg;
    authSuccess.classList.remove('hidden');
  }

  function clearAuthMessages() {
    authError.classList.add('hidden');
    authError.textContent = '';
    authSuccess.classList.add('hidden');
    authSuccess.textContent = '';
  }

  // Keep backward compat alias
  function clearAuthError() { clearAuthMessages(); }

  // Maps Firebase error codes → human-friendly messages
  function friendlyError(code) {
    const map = {
      'auth/user-not-found':          'No account found with this email.',
      'auth/wrong-password':          'Incorrect password. Please try again.',
      'auth/invalid-credential':      'Email or password is incorrect.',
      'auth/email-already-in-use':    'An account with this email already exists — sign in instead.',
      'auth/weak-password':           'Password must be at least 6 characters.',
      'auth/invalid-email':           'Please enter a valid email address.',
      'auth/too-many-requests':       'Too many failed attempts. Wait a moment and try again.',
      'auth/popup-closed-by-user':    'Sign-in popup was closed. Please try again.',
      'auth/cancelled-popup-request': 'Only one sign-in window allowed at a time.',
      'auth/network-request-failed':  'Network error — check your connection and try again.',
      'auth/operation-not-allowed':   'This sign-in method is not enabled in Firebase Console.',
    };
    return map[code] || 'Something went wrong. Please try again.';
  }

  // ─── Loading state ─────────────────────────────────────────
  function setLoading(on) {
    btnGoogle.disabled    = on;
    btnEmailAuth.disabled = on;
    if (!on) {
      btnEmailAuth.textContent = isSignUpMode ? 'Create account' : 'Sign in';
    } else {
      btnEmailAuth.textContent = isSignUpMode ? 'Creating account…' : 'Signing in…';
    }
  }

  // ─── Google Sign-In ────────────────────────────────────────
  btnGoogle.addEventListener('click', async () => {
    // Detect file:// — Firebase popups don't work without a real HTTP server
    if (window.location.protocol === 'file:') {
      showAuthError(
        '⚠️ Open this app via a local server (not file://). ' +
        'In VS Code: right-click index.html → "Open with Live Server". ' +
        'Or run: npx serve in this folder.'
      );
      return;
    }
    clearAuthError();
    setLoading(true);
    try {
      await auth.signInWithPopup(GoogleProvider);
      // onAuthStateChanged below handles everything after this
    } catch (e) {
      setLoading(false);
      showAuthError(friendlyError(e.code));
    }
  });

  // ─── Email / Password ──────────────────────────────────────
  btnEmailAuth.addEventListener('click', async () => {
    clearAuthError();

    const email = inputEmail.value.trim();
    const pwd   = inputPwd.value;
    const name  = inputName.value.trim();

    if (!email || !pwd) {
      showAuthError('Please enter your email and password.');
      return;
    }
    if (isSignUpMode && !name) {
      showAuthError('Please enter your name.');
      return;
    }
    if (isSignUpMode && pwd.length < 6) {
      showAuthError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (isSignUpMode) {
        const cred = await auth.createUserWithEmailAndPassword(email, pwd);
        // Save display name immediately after account creation
        if (name) await cred.user.updateProfile({ displayName: name });
        // Send email verification link immediately
        await cred.user.sendEmailVerification();
      } else {
        await auth.signInWithEmailAndPassword(email, pwd);
      }
      // onAuthStateChanged fires automatically
    } catch (e) {
      setLoading(false);
      showAuthError(friendlyError(e.code));
    }
  });

  // ─── Enter key submits form ────────────────────────────────
  [inputName, inputEmail, inputPwd].forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') btnEmailAuth.click();
    });
  });

  // ─── Forgot Password ──────────────────────────────────────
  btnForgotPwd.addEventListener('click', async () => {
    clearAuthMessages();
    const email = inputEmail.value.trim();
    if (!email) {
      showAuthError('Please enter your email address first, then tap "Forgot password?"');
      return;
    }
    btnForgotPwd.disabled = true;
    btnForgotPwd.textContent = 'Sending…';
    try {
      await auth.sendPasswordResetEmail(email);
      showAuthSuccess('Password reset link sent! Check your inbox (and spam folder).');
      // Cooldown
      let seconds = 30;
      const iv = setInterval(() => {
        seconds--;
        if (seconds <= 0) {
          clearInterval(iv);
          btnForgotPwd.textContent = 'Forgot password?';
          btnForgotPwd.disabled = false;
        } else {
          btnForgotPwd.textContent = `Resend in ${seconds}s`;
        }
      }, 1000);
    } catch (e) {
      btnForgotPwd.textContent = 'Forgot password?';
      btnForgotPwd.disabled = false;
      showAuthError(friendlyError(e.code));
    }
  });

  // ─── Toggle Sign-In ↔ Create Account ──────────────────────
  btnToggle.addEventListener('click', () => {
    isSignUpMode = !isSignUpMode;
    clearAuthMessages();
    inputEmail.value = '';
    inputPwd.value   = '';
    inputName.value  = '';

    if (isSignUpMode) {
      authFormTitle.textContent = 'Create your account';
      nameRow.classList.remove('hidden');
      btnForgotPwd.classList.add('hidden');
      inputPwd.setAttribute('autocomplete', 'new-password');
      btnEmailAuth.textContent  = 'Create account';
      btnToggle.textContent     = 'Already have an account? Sign in';
    } else {
      authFormTitle.textContent = 'Welcome back';
      nameRow.classList.add('hidden');
      btnForgotPwd.classList.remove('hidden');
      inputPwd.setAttribute('autocomplete', 'current-password');
      btnEmailAuth.textContent  = 'Sign in';
      btnToggle.textContent     = "Don't have an account? Create one";
    }
  });

  // ─── Verification Screen Handlers ─────────────────────────
  const screenVerification = $id('screen-verification');
  const vMsg               = $id('verification-msg');
  const vError             = $id('verification-error');
  const btnVCheck          = $id('btn-verification-check');
  const btnVResend         = $id('btn-verification-resend');
  const btnVSignout        = $id('btn-verification-signout');

  function showVerificationError(msg) {
    vError.textContent = msg;
    vError.classList.remove('hidden');
  }

  function showVerificationSuccess(msg) {
    vMsg.textContent = msg;
    vMsg.classList.remove('hidden');
  }

  function clearVerificationMessages() {
    vError.classList.add('hidden');
    vMsg.classList.add('hidden');
  }

  // Reload and check email verification status
  btnVCheck.addEventListener('click', async () => {
    clearVerificationMessages();
    const user = auth.currentUser;
    if (!user) return;

    btnVCheck.disabled = true;
    btnVCheck.textContent = 'Checking status…';
    try {
      await user.reload();
      if (auth.currentUser.emailVerified) {
        screenVerification.classList.add('hidden');
        if (typeof window.initApp === 'function') {
          window.initApp(auth.currentUser);
        }
      } else {
        showVerificationError('Email is not verified yet. Please check your inbox and verify.');
      }
    } catch (e) {
      showVerificationError(friendlyError(e.code));
    } finally {
      btnVCheck.disabled = false;
      btnVCheck.textContent = 'I have verified my email';
    }
  });

  // Resend email verification link
  btnVResend.addEventListener('click', async () => {
    clearVerificationMessages();
    const user = auth.currentUser;
    if (!user) return;

    btnVResend.disabled = true;
    try {
      await user.sendEmailVerification();
      showVerificationSuccess('Verification link sent successfully! Check your inbox.');
      
      // Cooldown timer to prevent spamming
      let seconds = 30;
      const interval = setInterval(() => {
        seconds--;
        if (seconds <= 0) {
          clearInterval(interval);
          btnVResend.textContent = 'Resend verification link';
          btnVResend.disabled = false;
        } else {
          btnVResend.textContent = `Resend available in ${seconds}s`;
        }
      }, 1000);
    } catch (e) {
      btnVResend.disabled = false;
      showVerificationError(friendlyError(e.code));
    }
  });

  // Sign out from verification screen
  btnVSignout.addEventListener('click', async () => {
    clearVerificationMessages();
    try {
      await auth.signOut();
    } catch (e) {
      showVerificationError(friendlyError(e.code));
    }
  });

  // ─── Auth State Listener ───────────────────────────────────
  // This is the single source of truth for what screen is shown.
  // Firebase calls this immediately on page load with the cached
  // session (no flicker), then again whenever sign-in/out happens.
  auth.onAuthStateChanged(user => {
    // Always hide the loading spinner once Firebase responds
    loadingOverlay.classList.add('hidden');

    if (user) {
      setLoading(false);
      
      // ✅ Check if email is verified
      // Google sign-in provides pre-verified accounts. 
      // Manual email sign-ups must be verified before accessing the app.
      if (user.emailVerified) {
        screenAuth.classList.add('hidden');
        screenVerification.classList.add('hidden');

        // Kick off the main app (defined in app.js)
        if (typeof window.initApp === 'function') {
          window.initApp(user);
        }
      } else {
        // ❌ Signed in but unverified
        screenAuth.classList.add('hidden');
        $id('screen-onboarding').classList.add('hidden');
        $id('screen-dashboard').classList.add('hidden');
        $id('btn-profile').classList.add('hidden');
        
        $id('verification-email-label').textContent = user.email;
        screenVerification.classList.remove('hidden');
        clearVerificationMessages();
      }
    } else {
      // ❌ No user → show auth screen, hide everything else
      screenAuth.classList.remove('hidden');
      screenVerification.classList.add('hidden');
      $id('screen-onboarding').classList.add('hidden');
      $id('screen-dashboard').classList.add('hidden');
      $id('btn-profile').classList.add('hidden');
      setLoading(false);
      clearAuthError();
    }
  });

})();
