import React from "react";
import { Badge, Button, Card, Column, Row, Text, FactGrid } from "@slopos/ui";
import { useHost, type SurfaceProps } from "@slopos/host";

interface WeatherData {
  location: string;
  tempC: string;
  feelsLikeC: string;
  desc: string;
  humidity: string;
  windKmph: string;
  windDir: string;
  todayMax: string;
  todayMin: string;
  sunrise: string;
  sunset: string;
}

export default function WeatherSurface(props: SurfaceProps<WeatherData>) {
  const { data } = props;
  const { host, logStatus } = useHost();

  const refresh = async () => {
    try {
      await host.tool('shell_exec', { args: { cmd: "curl -s 'wttr.in/Amsterdam?format=j1'" } });
      logStatus('Weather refreshed');
    } catch (e) {
      logStatus('Failed to refresh weather');
    }
  };

  return (
    <Card title="Amsterdam Weather">
      <Column gap={4}>
        <Row gap={4}>
          <Text tone="primary" size="lg">{data.tempC}°C</Text>
          <Text tone="muted">Feels like {data.feelsLikeC}°C</Text>
        </Row>
        <Text>{data.desc}</Text>
        <FactGrid items={[}
          { label: 'Humidity', value: data.humidity + '%' },
          { label: 'Wind', value: data.windKmph + ' km/h ' + data.windDir },
          { label: 'Today', value: data.todayMin + '° / ' + data.todayMax + '°C' },
          { label: 'Sunrise/Sunset', value: data.sunrise + ' / ' + data.sunset }
        ]} />
        <Button onClick={refresh} tone="secondary">Refresh</Button>
      </Column>
    </Card>
  );
}