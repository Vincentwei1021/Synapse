"use client";

import { useTranslations } from "next-intl";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getPromoteButtonState,
  type PaperFeedItemState,
} from "./paper-feeds-state";

interface PaperFeedsCardProps {
  item: PaperFeedItemState;
  runningPromote: ReadonlySet<string>;
  accentColor: string | null;
  onPromote: (itemUuid: string) => void;
}

export function PaperFeedsCard({
  item,
  runningPromote,
  accentColor,
  onPromote,
}: PaperFeedsCardProps) {
  const t = useTranslations("paperFeeds");
  const promoteState = getPromoteButtonState(item, runningPromote);

  return (
    <Card className="gap-3 px-5 py-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <a
            href={item.paperUrl}
            target="_blank"
            rel="noreferrer"
            className="text-base font-semibold hover:underline"
          >
            {item.title}
          </a>
          {item.arxivId ? (
            <Badge variant="outline" className="font-mono text-xs">
              {item.arxivId}
            </Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">{item.authors}</p>
      </div>
      <p className="text-muted-foreground pl-3 text-sm leading-relaxed">
        {item.summary}
      </p>
      <p
        className="border-l-2 pl-3 text-sm leading-relaxed"
        style={accentColor ? { borderColor: accentColor } : undefined}
      >
        {item.relevanceNote}
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant={promoteState.promoted ? "outline" : "default"}
          size="sm"
          disabled={promoteState.disabled}
          onClick={() => onPromote(item.uuid)}
        >
          {promoteState.loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : promoteState.promoted ? (
            <Check className="size-4" />
          ) : null}
          {promoteState.promoted
            ? t("actions.promoted")
            : t("actions.addToRelatedWorks")}
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={item.paperUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="size-4" />
            {t("actions.openArxiv")}
          </a>
        </Button>
      </div>
    </Card>
  );
}
