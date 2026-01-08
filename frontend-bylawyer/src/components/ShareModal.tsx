import { useState, useEffect } from 'react'
import { Copy, Check, RefreshCw, Link, AlertTriangle } from 'lucide-react'
import { documents as documentsApi, ShareStatus } from '../api/client'
import Modal from './ui/Modal'
import { useToast } from './ui/Toast'

interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
  documentId: string
  documentTitle: string
}

export default function ShareModal({
  isOpen,
  onClose,
  documentId,
  documentTitle,
}: ShareModalProps) {
  const { showToast } = useToast()
  const [shareStatus, setShareStatus] = useState<ShareStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [copying, setCopying] = useState(false)
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetchShareStatus()
    }
  }, [isOpen, documentId])

  const fetchShareStatus = async () => {
    try {
      setLoading(true)
      const status = await documentsApi.getShareStatus(documentId)
      setShareStatus(status)
    } catch (err) {
      showToast('error', 'Failed to load sharing status')
    } finally {
      setLoading(false)
    }
  }

  const handleEnableSharing = async () => {
    try {
      setLoading(true)
      const status = await documentsApi.enableSharing(documentId)
      setShareStatus(status)
      showToast('success', 'Sharing enabled')
    } catch (err) {
      showToast('error', 'Failed to enable sharing')
    } finally {
      setLoading(false)
    }
  }

  const handleDisableSharing = async () => {
    try {
      setLoading(true)
      await documentsApi.disableSharing(documentId)
      if (shareStatus) {
        setShareStatus({ ...shareStatus, share_enabled: false })
      }
      showToast('success', 'Sharing disabled')
    } catch (err) {
      showToast('error', 'Failed to disable sharing')
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerateToken = async () => {
    try {
      setRegenerating(true)
      const status = await documentsApi.regenerateShareToken(documentId)
      setShareStatus(status)
      setShowRegenerateConfirm(false)
      showToast('success', 'New share link generated. Old links no longer work.')
    } catch (err) {
      showToast('error', 'Failed to regenerate share link')
    } finally {
      setRegenerating(false)
    }
  }

  const getFullShareUrl = () => {
    if (!shareStatus) return ''
    return `${window.location.origin}/share/${shareStatus.share_token}`
  }

  const handleCopyLink = async () => {
    try {
      setCopying(true)
      await navigator.clipboard.writeText(getFullShareUrl())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      showToast('error', 'Failed to copy link')
    } finally {
      setCopying(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Share Document" size="md">
      <div className="space-y-4">
        <p className="text-sm text-secondary-600 dark:text-secondary-400">
          Share "{documentTitle}" with a read-only link. Anyone with this link can view the document.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : !shareStatus || !shareStatus.share_token ? (
          // No sharing set up yet
          <div className="text-center py-6">
            <Link className="w-12 h-12 text-secondary-300 mx-auto mb-4" />
            <p className="text-secondary-600 dark:text-secondary-400 mb-4">
              Sharing is not enabled for this document.
            </p>
            <button
              onClick={handleEnableSharing}
              className="btn-primary"
            >
              Enable Sharing
            </button>
          </div>
        ) : (
          // Sharing is set up
          <div className="space-y-4">
            {/* Share link */}
            <div>
              <label className="label">Share Link</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={getFullShareUrl()}
                  className="input flex-1 bg-secondary-50 dark:bg-secondary-800"
                />
                <button
                  onClick={handleCopyLink}
                  disabled={copying || !shareStatus.share_enabled}
                  className="btn-secondary flex items-center gap-2"
                  title={copied ? 'Copied!' : 'Copy to clipboard'}
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-success-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Enable/Disable toggle */}
            <div className="flex items-center justify-between py-3 border-t border-secondary-200 dark:border-secondary-700">
              <div>
                <p className="font-medium text-secondary-900 dark:text-white">
                  Sharing {shareStatus.share_enabled ? 'Enabled' : 'Disabled'}
                </p>
                <p className="text-sm text-secondary-500">
                  {shareStatus.share_enabled
                    ? 'Anyone with the link can view this document'
                    : 'The share link is currently inactive'}
                </p>
              </div>
              <button
                onClick={shareStatus.share_enabled ? handleDisableSharing : handleEnableSharing}
                className={shareStatus.share_enabled ? 'btn-ghost text-danger-600' : 'btn-primary'}
              >
                {shareStatus.share_enabled ? 'Disable' : 'Enable'}
              </button>
            </div>

            {/* Regenerate link */}
            {shareStatus.share_enabled && (
              <div className="border-t border-secondary-200 dark:border-secondary-700 pt-4">
                {showRegenerateConfirm ? (
                  <div className="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-warning-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium text-warning-800 dark:text-warning-200">
                          Regenerate share link?
                        </p>
                        <p className="text-sm text-warning-700 dark:text-warning-300 mt-1">
                          This will create a new link. Anyone using the old link will no longer be able to access this document.
                        </p>
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={handleRegenerateToken}
                            disabled={regenerating}
                            className="btn-primary bg-warning-600 hover:bg-warning-700 text-white"
                          >
                            {regenerating ? 'Regenerating...' : 'Yes, Regenerate'}
                          </button>
                          <button
                            onClick={() => setShowRegenerateConfirm(false)}
                            className="btn-ghost"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowRegenerateConfirm(true)}
                    className="btn-ghost text-secondary-600 flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Regenerate Link
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
