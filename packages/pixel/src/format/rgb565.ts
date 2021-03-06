import { Lane } from "../api";
import { defPackedFormat } from "./packed-format";

export const RGB565 = defPackedFormat({
    type: "u16",
    size: 16,
    channels: [
        { size: 5, lane: Lane.RED },
        { size: 6, lane: Lane.GREEN },
        { size: 5, lane: Lane.BLUE },
    ],
});
