import { startFramework } from "export-framework";
import { decodeGoal } from "./decode";
import { contextGoal } from "./context";
import { writeNoteGoal } from "./write";

startFramework([decodeGoal, contextGoal, writeNoteGoal]);
