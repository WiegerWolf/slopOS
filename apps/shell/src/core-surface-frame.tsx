import React from "react";
import { getCoreSurfaceDescriptor } from "@slopos/runtime";
import { Badge, Card, Column, Row, Text } from "@slopos/ui";

export function CoreSurfaceFrame(props: {
  surfaceId: string;
  title?: string;
  subtitle?: string;
  restored?: boolean;
  restoreStrategy?: string;
  children: React.ReactNode;
}) {
  const definition = getCoreSurfaceDescriptor(props.surfaceId);

  return (
    <Card
      title={props.title ?? definition?.title ?? "slopOS Surface"}
      subtitle={props.subtitle ?? definition?.subtitle}
    >
      <Column gap={14}>
        <Row gap={10}>
          <Badge tone="accent">core surface</Badge>
          {(definition?.capabilities ?? []).map((capability) => (
            <Badge key={capability} tone="muted">{capability}</Badge>
          ))}
          {definition?.refreshTool ? <Badge tone="muted">refresh: {definition.refreshTool}</Badge> : null}
          {props.restored ? <Badge tone="muted">restored</Badge> : null}
          {props.restoreStrategy ? <Badge tone="muted">{props.restoreStrategy}</Badge> : null}
        </Row>
        {props.children}
      </Column>
    </Card>
  );
}

export function CoreSurfaceHint(props: { children: React.ReactNode }) {
  return <Text tone="muted">{props.children}</Text>;
}
