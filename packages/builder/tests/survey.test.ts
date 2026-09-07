import { describe, expect, it } from "vitest";
import { catalogueEntry, isSurveyKey, surveyKey } from "../scripts/core/blueprint";
import { SURVEY_MAX, surveyBox, surveyRefusal } from "../scripts/core/survey";

describe("surveyBox", () => {
  it("spans the two stakes whichever way round they are, both included", () => {
    const box = surveyBox({ x: 10, y: 64, z: -3 }, { x: 4, y: 66, z: 2 });
    expect(box.min).toEqual({ x: 4, y: 64, z: -3 });
    expect(box.max).toEqual({ x: 10, y: 66, z: 2 });
    expect(box.size).toEqual({ x: 7, y: 3, z: 6 });
  });
  it("is capped at sixteen each way, and refuses a single block", () => {
    expect(surveyRefusal(surveyBox({ x: 0, y: 0, z: 0 }, { x: SURVEY_MAX - 1, y: SURVEY_MAX - 1, z: SURVEY_MAX - 1 }))).toBeUndefined();
    expect(surveyRefusal(surveyBox({ x: 0, y: 0, z: 0 }, { x: SURVEY_MAX, y: 0, z: 0 }))).toBe("the box is 17 by 1 by 1; a survey is at most 16 each way");
    expect(surveyRefusal(surveyBox({ x: 3, y: 3, z: 3 }, { x: 3, y: 3, z: 3 }))).toBe("the two stakes stand in the same block");
  });
});

describe("survey keys", () => {
  it("are numbered, and get a synthesised catalogue entry", () => {
    expect(surveyKey(3)).toBe("survey_3");
    expect(isSurveyKey("survey_12")).toBe(true);
    expect(isSurveyKey("survey_0")).toBe(false);
    expect(isSurveyKey("tallfolk_well")).toBe(false);
    expect(catalogueEntry("survey_3")?.title).toBe("Survey 3");
    expect(catalogueEntry("survey_x")).toBeUndefined();
  });
});
