import { FileText, X } from 'lucide-react'
import { formatBytes, isImage } from '../../lib/files'

interface Props {
  filename: string
  contentType: string
  size: number
  /** image preview / download url */
  src?: string
  href?: string
  onRemove?: () => void
}

/** thumbnail card used under the compose editor and on the email detail page */
export function AttachmentTile({ filename, contentType, size, src, href, onRemove }: Props) {
  const body = (
    <>
      <div className="flex h-24 w-40 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
        {src && isImage(contentType) ? (
          <img src={src} alt={filename} className="h-full w-full object-cover" />
        ) : (
          <FileText className="h-8 w-8 text-gray-400" />
        )}
      </div>
      <p className="mt-1.5 w-40 truncate text-xs font-medium text-gray-800">{filename}</p>
      <p className="text-xs text-gray-400">{formatBytes(size)}</p>
    </>
  )

  return (
    <div className="group relative">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">
          {body}
        </a>
      ) : (
        body
      )}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${filename}`}
          onClick={onRemove}
          className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-gray-500 shadow hover:text-gray-900"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
