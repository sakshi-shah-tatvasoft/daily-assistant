import { Component, type ReactNode } from 'react';
import { reportError } from '../lib/errorReport';
import { t } from '../lib/i18n';

/** If a screen crashes: show a friendly message with Reload instead of a blank page, and report it. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { reportError(error, 'screen'); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center">
        <p className="text-4xl mb-3">😕</p>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{t('Something went wrong')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{t("We've been told about it. Your data is safe.")}</p>
        <button className="btn-primary" onClick={() => { location.href = '/'; }}>{t('Reload the app')}</button>
      </div>
    );
  }
}
