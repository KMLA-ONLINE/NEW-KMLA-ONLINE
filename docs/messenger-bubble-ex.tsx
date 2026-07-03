import * as React from 'react';
import { Reply } from 'lucide-react';
import { Avatar } from '../../atoms/Badge/Avatar';
import { ImageThumb } from '../../atoms/ImageThumb';
import { FileChip } from '../../atoms/FileChip';
import { TimeBadge } from '../../atoms/TimeBadge';
import type { AvatarProps } from '../../atoms/Badge/Avatar';

export interface MessageBubbleFile {
  name: string;
  size?: number;
}

export interface MessageBubbleReplyTo {
  name: string;
  content: string;
}

export type MessageBubbleGroupPosition = 'single' | 'start' | 'middle' | 'end';

const getBubbleShapeClass = (
  isOwn: boolean | undefined,
  groupPosition: MessageBubbleGroupPosition
) => {
  if (isOwn) {
    switch (groupPosition) {
      case 'start':
        return 'rounded-[1.25rem] rounded-br-none';
      case 'middle':
        return 'rounded-[1.25rem] rounded-tr-none rounded-br-none';
      case 'end':
        return 'rounded-[1.25rem] rounded-tr-none';
      default:
        return 'rounded-[1.25rem]';
    }
  }

  switch (groupPosition) {
    case 'start':
      return 'rounded-[1.25rem] rounded-bl-none';
    case 'middle':
      return 'rounded-[1.25rem] rounded-tl-none rounded-bl-none';
    case 'end':
      return 'rounded-[1.25rem] rounded-tl-none';
    default:
      return 'rounded-[1.25rem]';
  }
};

export interface MessageBubbleProps {
  avatar?: Omit<AvatarProps, 'ref'>;
  name: string;
  content?: string;
  image?: string;
  file?: MessageBubbleFile;
  replyTo?: MessageBubbleReplyTo;
  time?: Date | string | number;
  timeFormat?: 'relative' | 'absolute';
  metaLabel?: string;
  isEdited?: boolean;
  isDeleted?: boolean;
  isOwn?: boolean;
  groupPosition?: MessageBubbleGroupPosition;
  showAvatar?: boolean;
  showName?: boolean;
  showTime?: boolean;
  className?: string;
}

const MessageBubble = React.forwardRef<HTMLDivElement, MessageBubbleProps>(
  (
    {
      avatar,
      name,
      content,
      image,
      file,
      replyTo,
      time,
      timeFormat = 'relative',
      metaLabel,
      isEdited,
      isDeleted,
      isOwn,
      groupPosition = 'single',
      showAvatar = !isOwn,
      showName = !isOwn,
      showTime = true,
      className,
    },
    ref
  ) => {
    const shouldShowAvatar = Boolean(!isOwn && showAvatar);
    const displayContent = isDeleted ? '메시지가 삭제되었습니다' : content;
    const shouldShowReply = Boolean(replyTo && !isDeleted);
    const shouldShowImage = Boolean(image && !isDeleted);
    const shouldShowFile = Boolean(file && !isDeleted);
    const hasBody = Boolean(
      displayContent || shouldShowImage || shouldShowFile
    );
    const shouldShowMetaLabel = Boolean(
      metaLabel && isOwn && ['single', 'end'].includes(groupPosition)
    );
    const shouldShowEditedLabel = Boolean(isEdited && !isDeleted);
    const showMeta = Boolean((time && showTime) || shouldShowMetaLabel);
    const metaToneClass = isOwn
      ? 'text-right text-[var(--color-text-tertiary)]'
      : 'text-left text-[var(--color-text-tertiary)]';
    const hasFileSize = file?.size !== undefined;
    const bubbleShapeClass = getBubbleShapeClass(isOwn, groupPosition);
    const groupedStackOffsetClass =
      groupPosition === 'middle' || groupPosition === 'end' ? '-mt-0.5' : '';
    const bubbleToneClass = isDeleted
      ? 'border border-[var(--color-border-default)] bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)]'
      : isOwn
        ? 'bg-[var(--color-action-default)] text-[var(--color-action-foreground)]'
        : 'bg-[var(--color-surface-subtle)] text-[var(--color-text-primary)]';
    const fileChipToneClass = isOwn
      ? `border-white/15 bg-white/10 [&_.lucide]:text-white/70 ${
          hasFileSize
            ? '[&>span:first-of-type]:text-white [&>span:last-of-type]:text-white/70'
            : '[&>span]:text-white'
        }`
      : '';

    return (
      <div
        ref={ref}
        className={`flex flex-col gap-1 ${groupedStackOffsetClass} ${className ?? ''}`}
      >
        {!isOwn && showName && (
          <div className="pl-10">
            <span className="text-xs text-[var(--color-text-secondary)]">
              {name}
            </span>
          </div>
        )}
        <div
          className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
        >
          {!isOwn && (
            <div className="flex w-8 shrink-0 items-end">
              {shouldShowAvatar && (
                <Avatar
                  {...avatar}
                  fallback={avatar?.fallback ?? name}
                  size="sm"
                />
              )}
            </div>
          )}
          <div
            className={`flex max-w-[min(20rem,70%)] flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'} sm:max-w-[70%]`}
          >
            {shouldShowReply && replyTo && (
              <div
                className={`flex max-w-full flex-col gap-1 ${
                  isOwn ? 'items-end' : 'items-start'
                }`}
              >
                <div className="inline-flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">
                  <Reply
                    className="h-3.5 w-3.5 fill-current"
                    aria-hidden="true"
                  />
                  <span>{replyTo.name}님에게 보낸 답장</span>
                </div>
                <div
                  className={`max-w-[calc(100%-1.25rem)] rounded-2xl bg-[var(--color-surface-subtle)] px-2.5 pt-1.5 pb-4 text-sm text-[var(--color-text-tertiary)] ${
                    isOwn ? 'rounded-br-md' : 'rounded-bl-md'
                  }`}
                >
                  <div className="line-clamp-3 whitespace-pre-wrap">
                    {replyTo.content}
                  </div>
                </div>
              </div>
            )}
            {hasBody && (
              <div
                className={`flex flex-col gap-1 ${shouldShowReply ? '-mt-4' : ''}`}
              >
                {shouldShowEditedLabel && (
                  <span className="self-end px-1 text-[11px] text-[var(--color-text-tertiary)]">
                    수정됨
                  </span>
                )}
                <div
                  className={`${bubbleShapeClass} px-3 py-2 ${bubbleToneClass}`}
                >
                  {displayContent && (
                    <p
                      className={`text-sm leading-5 whitespace-pre-wrap ${
                        isDeleted ? 'italic' : ''
                      }`}
                    >
                      {displayContent}
                    </p>
                  )}
                  {shouldShowImage && image && (
                    <ImageThumb
                      src={image}
                      alt={`${name} attachment`}
                      aspect="wide"
                      className={`${displayContent ? 'mt-2' : ''} max-w-[14rem] sm:max-w-[16rem]`}
                      rounded="lg"
                    />
                  )}
                  {shouldShowFile && file && (
                    <FileChip
                      fileName={file.name}
                      fileSize={file.size}
                      className={`${displayContent || shouldShowImage ? 'mt-2' : ''} ${fileChipToneClass}`}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        {showMeta && (
          <div className={isOwn ? 'flex justify-end' : 'pl-10'}>
            <div
              className={`-mt-0.5 flex max-w-[min(20rem,70%)] items-center gap-1.5 px-1 text-[11px] ${metaToneClass} ${
                isOwn ? 'justify-end' : 'justify-start'
              } sm:max-w-[70%]`}
            >
              {time && showTime && (
                <TimeBadge date={time} format={timeFormat} size="xs" />
              )}
              {shouldShowMetaLabel && <span>{metaLabel}</span>}
            </div>
          </div>
        )}
      </div>
    );
  }
);
MessageBubble.displayName = 'MessageBubble';

export { MessageBubble };