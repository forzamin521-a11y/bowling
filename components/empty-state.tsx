import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** 빈 목록/결과를 위한 공용 빈 상태. 아이콘 + 안내문 + (선택) 액션. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "flex flex-col items-center gap-2 px-4 py-14 text-center",
        className,
      )}
    >
      <Icon className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </Card>
  );
}
