import React from "react";
import { ImageComparison } from "./ui/image-comparison-slider";

export function ComparisonDemo() {
  return (
    <div id="comparison" className="w-full bg-gray-50 flex flex-col items-center justify-center font-sans py-20 px-4 scroll-mt-24">
      <div className="w-full text-center mb-12">
        <h2 className="max-w-2xl mx-auto text-4xl md:text-5xl font-bold text-mistio-dark mb-4">
          Their Setup vs. <span className="text-mistio-teal">Ours</span>
        </h2>
        <p className="text-xl text-mistio-gray max-w-2xl mx-auto">
          They need cables, ceiling work, and an electrician. We need a wall and 3 seconds.
        </p>
      </div>

      <ImageComparison
        beforeImage="/mistiosensor.png"
        afterImage="/traditionalvapesensors.png"
        altBefore="Mistio Advanced Sensor"
        altAfter="Traditional Vape Sensors"
      />
    </div>
  );
}
