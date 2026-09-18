import { useEffect, useState } from "react";
import dagre from "@dagrejs/dagre";
import {
  ReactFlow,
  Background,
  Controls,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

function DependencyGraph({ dependencies }) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);

useEffect(() => {
  if (!dependencies) return;

  const newNodes = [];
  const newEdges = [];
  const nodeIds = new Set();

  dependencies.forEach((dependency, index) => {
    const source = dependency.source;
    const target = dependency.target;

    if (!nodeIds.has(source)) {
      newNodes.push({
        id: source,
        position: { x: 0, y: 0 },
        data: {
          label: source,
        },
      });

      nodeIds.add(source);
    }

    if (!nodeIds.has(target)) {
      newNodes.push({
        id: target,
        position: { x: 0, y: 0 },
        data: {
          label: target,
        },
      });

      nodeIds.add(target);
    }

    newEdges.push({
      id: `edge-${index}`,
      source,
      target,
    });
  });

  // Create Dagre graph
  const dagreGraph = new dagre.graphlib.Graph();

  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({
    rankdir: "TB",
    nodesep: 80,
    ranksep: 120,
  });

  // Add nodes to Dagre
  newNodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: 180,
      height: 50,
    });
  });

  // Add edges to Dagre
  newEdges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Calculate layout
  dagre.layout(dagreGraph);

  // Apply calculated positions
  newNodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);

    node.position = {
      x: nodeWithPosition.x - 90,
      y: nodeWithPosition.y - 25,
    };
  });

  setNodes(newNodes);
  setEdges(newEdges);
}, [dependencies]);

  return (
    <div style={{ width: "100%", height: "600px" }}>
      <ReactFlow nodes={nodes} edges={edges}>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export default DependencyGraph;