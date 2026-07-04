import Link, { type LinkProps } from "next/link";
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

type UiVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type UiSize = "sm" | "md" | "lg";
type UiTooltipSide = "top" | "bottom" | "left" | "right";
type UiStateTone = "empty" | "loading" | "error" | "warning" | "success" | "info";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function variantClass(variant: UiVariant) {
  if (variant === "primary") return "ui-btn--primary";
  if (variant === "ghost") return "ui-btn--ghost";
  if (variant === "danger") return "ui-btn--danger";
  if (variant === "success") return "ui-btn--success";
  return "ui-btn--secondary";
}

function sizeClass(size: UiSize) {
  if (size === "sm") return "ui-btn--sm";
  if (size === "lg") return "ui-btn--lg";
  return "ui-btn--md";
}

export type UiButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: UiVariant;
  size?: UiSize;
  fullWidth?: boolean;
};

export const UiButton = forwardRef<HTMLButtonElement, UiButtonProps>(
  function UiButton(
    { variant = "secondary", size = "md", fullWidth = false, className, ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        className={cx(
          "ui-btn",
          variantClass(variant),
          sizeClass(size),
          fullWidth && "ui-btn--full",
          className
        )}
        {...props}
      />
    );
  }
);

export type UiLinkButtonProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    variant?: UiVariant;
    size?: UiSize;
    fullWidth?: boolean;
  };

export function UiLinkButton({
  variant = "secondary",
  size = "md",
  fullWidth = false,
  className,
  ...props
}: UiLinkButtonProps) {
  return (
    <Link
      className={cx(
        "ui-btn",
        variantClass(variant),
        sizeClass(size),
        fullWidth && "ui-btn--full",
        className
      )}
      {...props}
    />
  );
}

type UiControlShared = {
  fullWidth?: boolean;
};

export type UiInputProps = InputHTMLAttributes<HTMLInputElement> & UiControlShared;
export const UiInput = forwardRef<HTMLInputElement, UiInputProps>(
  function UiInput({ className, fullWidth = true, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cx("ui-control", fullWidth && "ui-control--full", className)}
        {...props}
      />
    );
  }
);

export type UiSelectProps = SelectHTMLAttributes<HTMLSelectElement> & UiControlShared;
export const UiSelect = forwardRef<HTMLSelectElement, UiSelectProps>(
  function UiSelect({ className, fullWidth = true, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cx("ui-control", "ui-select", fullWidth && "ui-control--full", className)}
        {...props}
      />
    );
  }
);

export type UiTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & UiControlShared;
export const UiTextarea = forwardRef<HTMLTextAreaElement, UiTextareaProps>(
  function UiTextarea({ className, fullWidth = true, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cx("ui-control", "ui-textarea", fullWidth && "ui-control--full", className)}
        {...props}
      />
    );
  }
);

export type UiCardProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "article" | "div" | "aside";
};

export function UiCard({ as = "section", className, ...props }: UiCardProps) {
  const Component = as;
  return <Component className={cx("ui-card", className)} {...props} />;
}

type UiFeedbackTone = "info" | "success" | "error" | "warning";

export type UiStatusProps = HTMLAttributes<HTMLDivElement> & {
  tone?: UiFeedbackTone;
};

export function UiStatus({ tone = "info", className, children, ...props }: UiStatusProps) {
  return (
    <div className={cx("ui-status", className)} data-tone={tone} {...props}>
      <span className="ui-status-icon" aria-hidden="true" />
      <div className="ui-status-content">{children}</div>
    </div>
  );
}

export type UiEmptyStateProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "div" | "aside";
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tone?: UiStateTone;
};

export function UiEmptyState({
  as = "section",
  className,
  title,
  description,
  actions,
  tone = "empty",
  children,
  ...props
}: UiEmptyStateProps) {
  const Component = as;
  return (
    <Component className={cx("ui-empty-state", className)} data-tone={tone} {...props}>
      <span className="ui-state-icon" aria-hidden="true" />
      {title ? <strong>{title}</strong> : null}
      {description ? <span>{description}</span> : null}
      {children}
      {actions ? <div className="ui-state-actions">{actions}</div> : null}
    </Component>
  );
}

export type UiLoadingStateProps = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode;
  description?: ReactNode;
};

export function UiLoadingState({
  className,
  title = "loading",
  description,
  children,
  ...props
}: UiLoadingStateProps) {
  return (
    <div className={cx("ui-loading-state", className)} role="status" aria-live="polite" {...props}>
      <span className="ui-loading-spinner" aria-hidden="true" />
      <div className="ui-state-copy">
        {children ?? (
          <>
            <strong>{title}</strong>
            {description ? <span>{description}</span> : null}
          </>
        )}
      </div>
    </div>
  );
}

export type UiErrorStateProps = UiEmptyStateProps & {
  title?: ReactNode;
};

export function UiErrorState({
  title = "something went wrong",
  tone = "error",
  ...props
}: UiErrorStateProps) {
  return <UiEmptyState title={title} tone={tone} role="alert" {...props} />;
}

export type UiFieldLabelProps = LabelHTMLAttributes<HTMLLabelElement>;
export function UiFieldLabel({ className, ...props }: UiFieldLabelProps) {
  return <label className={cx("ui-field-label", className)} {...props} />;
}

export type UiFormFieldProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  htmlFor?: string;
  helperText?: ReactNode;
  error?: ReactNode;
  required?: boolean;
};

export function UiFormField({
  label,
  htmlFor,
  helperText,
  error,
  required = false,
  className,
  children,
  ...props
}: UiFormFieldProps) {
  const helperId = htmlFor && helperText ? `${htmlFor}-hint` : undefined;
  const errorId = htmlFor && error ? `${htmlFor}-error` : undefined;

  return (
    <div className={cx("ui-form-field", Boolean(error) && "ui-form-field--invalid", className)} {...props}>
      <UiFieldLabel htmlFor={htmlFor}>
        <span>{label}</span>
        {required ? <span className="ui-field-required">required</span> : null}
      </UiFieldLabel>
      {children}
      {helperText ? (
        <p className="ui-field-helper" id={helperId}>
          {helperText}
        </p>
      ) : null}
      {error ? (
        <p className="ui-field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export type UiTooltipProps = HTMLAttributes<HTMLSpanElement> & {
  content: ReactNode;
  side?: UiTooltipSide;
};

export function UiTooltip({
  content,
  side = "top",
  className,
  children,
  ...props
}: UiTooltipProps) {
  return (
    <span className={cx("ui-tooltip", className)} data-side={side} {...props}>
      {children}
      <span className="ui-tooltip-bubble" role="tooltip">
        {content}
      </span>
    </span>
  );
}
