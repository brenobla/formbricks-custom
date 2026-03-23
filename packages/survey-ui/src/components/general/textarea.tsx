import { useCallback } from "react";
import { cn } from "@/lib/utils";

type TextareaProps = React.ComponentProps<"textarea"> & {
  dir?: "ltr" | "rtl" | "auto";
  errorMessage?: string;
};

function Textarea({ className, dir = "auto", onKeyDown, ...props }: TextareaProps): React.JSX.Element {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        // Submit the closest form
        const form = (e.target as HTMLTextAreaElement).closest("form");
        if (form) {
          form.requestSubmit();
        }
      }
      onKeyDown?.(e);
    },
    [onKeyDown]
  );

  return (
    <div className="relative space-y-2">
      <textarea
        data-slot="textarea"
        style={{ fontSize: "var(--fb-input-font-size)" }}
        dir={dir}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-input bg-input-bg border-input-border rounded-input font-input font-input-weight px-input-x py-input-y shadow-input placeholder:text-input-placeholder placeholder:opacity-input-placeholder focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 text-input text-input-text flex field-sizing-content min-h-16 border transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  );
}

export { Textarea };
