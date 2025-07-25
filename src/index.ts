import { startFramework } from "export-framework";
import { searchContextGoal } from "./searchContextGoal";
import { writeNoteWithSearchGoal } from "./writeNoteWithSearchGoal";
import { checkSource } from "./check";

startFramework([searchContextGoal, writeNoteWithSearchGoal, checkSource]);
