import React from "react";
import { Card, Column, Row, Text, FactGrid, SectionList } from "@slopos/ui";
import { useHost, type SurfaceProps } from "@slopos/host";

export default function(props: SurfaceProps<{ current: any; today: any }>) {
  const { current, today } = props.data;
  const host = useHost();
  return (
    <Card title="Amsterdam Weather" subtitle="Live weather data">
      <Column gap={4}>
        <Row gap={4}>
          <Column>
            <Text tone="primary" size="lg">{current.temp_C}°C</Text>
            <Text tone="muted">{current.weatherDesc[0].value}</Text>
          </Column>
          <Column align="end">
            <FactGrid items={[
              { label: "Feels like", value: `${current.FeelsLikeC}°C` },
              { label: "Humidity", value: `${current.humidity}%` },
              { label: "Wind", value: `${current.windspeedKmph} km/h ${current.winddir16Point}` },
              { label: "Pressure", value: `${current.pressure} hPa` },
              { label: "Visibility", value: `${current.visibility} km` },
              { label: "UV Index", value: `${current.uvIndex}` },
            ]} />
          </Column>
        </Row>
        <SectionList sections={[
          {
            title: "Today",
            lines: [
              `High: ${today.maxtempC}°C`,
              `Low: ${today.mintempC}°C`,
              `Sunrise: ${today.astronomy[0].sunrise}`,
              `Sunset: ${today.astronomy[0].sunset}`,
            ]
          }
        ]} />
      </Column>
    </Card>
  );
}