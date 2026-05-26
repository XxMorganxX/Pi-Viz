export const graphInteractionProps: {
  panOnDrag: boolean;
  nodesDraggable: boolean;
  selectionOnDrag: boolean;
  elevateNodesOnSelect: boolean;
  minZoom: number;
  maxZoom: number;
  translateExtent: [[number, number], [number, number]];
} = {
  panOnDrag: true,
  nodesDraggable: true,
  selectionOnDrag: false,
  elevateNodesOnSelect: false,
  minZoom: 0.03,
  maxZoom: 2,
  translateExtent: [
    [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
    [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
  ],
} as const;
