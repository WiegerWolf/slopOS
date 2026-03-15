import React from "react";
import { Card, SectionList, Text } from "@slopos/ui";
import { useHost, type SurfaceProps } from "@slopos/host";

export default function WeatherSurface(props: SurfaceProps<{
  location: string;
  observationTime: string;
  temperature: string;
  feelsLike: string;
  description: string;
  humidity: string;
  pressure: string;
  wind: string;
  visibility: string;
  uvIndex: string;
  today: {
    date: string;
    maxTemp: string;
    minTemp: string;
  }
}>) {
  const { data } = props;
  return (
    <Card title="Amsterdam Weather" subtitle={data.location}>
      <SectionList sections={[
        {
          title: "Current Conditions",
          lines: [
            `${data.temperature} (feels like ${data.feelsLike})`,
            data.description,
            `Humidity: ${data.humidity}`,
            `Pressure: ${data.pressure}`,
            `Wind: ${data.wind}`,
            `Visibility: ${data.visibility}`,
            `UV Index: ${data.uvIndex}`
          ]
        },
        {
          title: "Today",
          lines: [
            `Date: ${data.today.date}`,
            `High: ${data.today.maxTemp}`,
            `Low: ${data.today.minTemp}`
          ]
        }
      ]}>
      </SectionList>
    </Card>
  );
}