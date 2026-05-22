import * as React from "react";
import { cn } from "@/lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
  alt?: string;
}

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, size = "md", children, alt, ...props }, ref) => {
    const sizeClass =
      size === "sm" ? "h-8 w-8 text-sm" : size === "lg" ? "h-12 w-12 text-xl" : "h-10 w-10 text-base";

    // 若 children 是 http URL，渲染为圆形图片
    const isUrl = typeof children === "string" && children.startsWith("http");

    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-medium overflow-hidden",
          sizeClass,
          className,
        )}
        {...props}
      >
        {isUrl ? (
          <img src={children} alt={alt ?? ""} className="w-full h-full object-cover" />
        ) : (
          children
        )}
      </div>
    );
  },
);
Avatar.displayName = "Avatar";
