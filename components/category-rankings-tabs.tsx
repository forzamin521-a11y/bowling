"use client";

import type { ReactNode } from "react";
import { Hourglass } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type RankingTab = {
  value: string;
  label: string;
  content: ReactNode;
  /** 지정 시 content 대신 '집계 준비 중' 안내를 보여준다. */
  notReady?: { title: string; description: string };
};

/**
 * 종별 순위 페이지의 탭: 개인/2인조/3인조/5인조(존재하는 종목만) +
 * 개인종합 + 종합집계. 탭 구성은 서버에서 결정해 넘긴다.
 */
export function CategoryRankingsTabs({ tabs }: { tabs: RankingTab[] }) {
  if (tabs.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          표시할 순위가 없습니다.
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue={tabs[0].value} className="block min-w-0">
      <TabsList className="mb-4 h-10 w-full justify-start overflow-x-auto print:hidden">
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value} className="block w-full">
          {t.notReady ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <Hourglass className="h-7 w-7 text-muted-foreground/40" />
                <p className="text-sm font-medium">{t.notReady.title}</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {t.notReady.description}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid min-w-0 gap-6">{t.content}</div>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
