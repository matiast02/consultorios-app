import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";
import { initialsFromName } from "@/lib/names";

function getInitials(name?: string | null): string {
  return name ? initialsFromName(name) : "U";
}

interface UserAvatarProps {
  name?: string | null;
  image?: string | null;
  className?: string;
}

/**
 * Displays the user's avatar image if available, or falls back to
 * their initials derived from their name.
 */
export function UserAvatar({ name, image, className }: UserAvatarProps) {
  const initials = getInitials(name);

  return (
    <AvatarPrimitive.Root
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-full",
        className
      )}
    >
      {image && (
        <AvatarPrimitive.Image
          src={image}
          alt={name ?? "User avatar"}
          className="aspect-square h-full w-full object-cover"
        />
      )}
      <AvatarPrimitive.Fallback
        className="flex h-full w-full items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground"
        delayMs={600}
      >
        {initials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

