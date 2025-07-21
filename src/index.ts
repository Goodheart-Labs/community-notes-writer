import { startFramework } from "export-framework";
// import { decodeGoal } from "./decode";
import { contextGoal } from "./context";
import { writeNoteGoal } from "./write";
import { searchContextGoal } from "./searchContext";
import { verifyContextWithSourceGoal } from "./verifyContextWithSource";
import { writeNoteWithSearchGoal } from "./write-2";

startFramework([
  // contextGoal,
  searchContextGoal,
  writeNoteWithSearchGoal,
  // verifyContextWithSourceGoal,
  // writeNoteGoal,
]);
