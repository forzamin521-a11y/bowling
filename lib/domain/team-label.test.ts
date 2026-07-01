import { describe, expect, it } from "vitest";

import { groupKey, teamLabelForPosition } from "./team-label";

describe("teamLabelForPosition", () => {
  it("1~6번째는 A", () => {
    for (let p = 1; p <= 6; p++) expect(teamLabelForPosition(p)).toBe("A");
  });

  it("7~12번째는 B", () => {
    for (let p = 7; p <= 12; p++) expect(teamLabelForPosition(p)).toBe("B");
  });

  it("13~18번째는 C", () => {
    expect(teamLabelForPosition(13)).toBe("C");
    expect(teamLabelForPosition(18)).toBe("C");
  });

  it("경계값: 6→A, 7→B, 12→B, 19→D", () => {
    expect(teamLabelForPosition(6)).toBe("A");
    expect(teamLabelForPosition(7)).toBe("B");
    expect(teamLabelForPosition(12)).toBe("B");
    expect(teamLabelForPosition(19)).toBe("D");
  });

  it("0 이하면 빈 문자열", () => {
    expect(teamLabelForPosition(0)).toBe("");
    expect(teamLabelForPosition(-3)).toBe("");
  });
});

describe("groupKey", () => {
  it("시군 + 소속(trim) 으로 키를 만든다", () => {
    expect(groupKey(5, " 볼링클럽 ")).toBe("5:볼링클럽");
  });

  it("다른 시군이면 다른 키", () => {
    expect(groupKey(1, "A")).not.toBe(groupKey(2, "A"));
  });
});
