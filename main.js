const dataUrl =
  "https://raw.githubusercontent.com/owid/covid-19-data/master/public/data/cases_deaths/new_deaths.csv";

const topoUrl = "https://unpkg.com/world-atlas@2.0.2/countries-50m.json";

const width = window.innerWidth;
const height = window.innerHeight;
const margin = { left: 60, right: 20 };
const marginChart = { top: 20, bottom: 30 };
const marginMap = { top: 20, bottom: 30 };
const chartHeight = height * 0.25;
const dotRadius = 3;
const countryRadius = 50;

const drawChart = (data, country, svg, brushingMap) => {
  const xAccessor = (d) => d.date;
  const yAccessor = (d) => d[country];

  const xScale = d3
    .scaleTime()
    .domain(d3.extent(data, xAccessor))
    .range([margin.left, width - margin.right]);

  const yScale = d3
    .scaleLinear()
    .domain(d3.extent(data, yAccessor))
    .range([chartHeight - marginChart.bottom, marginChart.top]);

  svg
    .selectAll(".dot")
    .data(data)
    .join("circle")
    .attr("class", "dot")
    .attr("cx", (d) => xScale(xAccessor(d)))
    .attr("cy", (d) => yScale(yAccessor(d)))
    .attr("r", dotRadius);

  const xAxis = svg
    .selectAll(".x-axis")
    .data([null])
    .join("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0, ${chartHeight - marginChart.bottom})`)
    .call(d3.axisBottom(xScale));

  const yAxis = svg
    .selectAll(".y-axis")
    .data([null])
    .join("g")
    .attr("class", "y-axis")
    .attr("transform", `translate(${margin.left}, 0)`)
    .call(d3.axisLeft(yScale));

  const yAxisLabel = svg
    .selectAll(".y-axis-label")
    .data([null])
    .join("text")
    .attr("class", "y-axis-label")
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle")
    .attr("x", -(chartHeight - marginChart.bottom - marginChart.top) / 2)
    .attr("y", 20)
    .text("Deaths");

  const brushed = ({ selection }) => {
    let selectedDay;
    if (selection) {
      selectedDay = selection
        .map((d) => xScale.invert(d))
        .map(d3.timeDay.round);
    }
    brushingMap(selectedDay);
  };

  const brush = d3
    .brushX()
    .extent([
      [margin.left, marginChart.top],
      [width - margin.right, chartHeight - marginChart.bottom],
    ])
    .on("brush", brushed)
    .on("end", brushed);

  svg
    .selectAll(".brush")
    .data([null])
    .join("g")
    .attr("class", "brush")
    .call(brush);
};

const drawCircle = (
  geoData,
  mapBounds,
  sumData,
  circleScale,
  pathGenerator
) => {
  mapBounds
    .selectAll(".center-circle")
    .data(geoData.features)
    .join("circle")
    .attr("class", "center-circle")
    .attr("transform", (d) => {
      let coords = pathGenerator.centroid(d.geometry);
      return `translate(${coords[0]}, ${coords[1]})`;
    })
    .attr("r", (d) => circleScale(sumData.get(d.properties.name)))
    .append("title")
    .text((d) => sumData.get(d.properties.name));
};

const dataParse = (d) => {
  for (let [key, value] of Object.entries(d)) {
    if (key === "date") {
      d.date = d3.timeParse("%Y-%m-%d")(d.date);
    } else if (key === "United States") {
      d["United States of America"] = +value;
      delete d[key];
    } else {
      d[key] = +value;
    }
  }
  return d;
};

const getCountryTotalByDate = (data, country, [initialDate, finalDate]) => {
  const selectedData = data.filter(
    (d) => initialDate <= d.date && d.date <= finalDate
  );
  return selectedData.reduce((acc, cv) => acc + cv[country], 0);
};

const main = async () => {
  const covidDeathData = await d3.csv(dataUrl, dataParse);

  const regionNames = Object.keys(covidDeathData[0]);

  const topoData = await d3.json(topoUrl);

  const { countries, land } = topoData.objects;
  const geoData = topojson.feature(topoData, countries);

  const allCountries = topoData.objects.countries.geometries.map(
    (d) => d.properties.name
  );

  const totalData = new Map();

  allCountries.forEach((country) => {
    totalData.set(
      country,
      getCountryTotalByDate(
        covidDeathData,
        country,
        d3.extent(covidDeathData, (d) => d.date)
      )
    );
  });

  const circleScale = d3
    .scaleSqrt()
    .domain([0, d3.max(totalData.values())])
    .range([0, countryRadius]);
  const svg = d3
    .select("#main-chart")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const sphere = { type: "Sphere" };

  const projection = d3
    .geoNaturalEarth1()
    .fitHeight(height - chartHeight - marginMap.top - marginMap.bottom, sphere);

  const pathGenerator = d3.geoPath(projection);
  const [[x0, y0], [x1, y1]] = pathGenerator.bounds(sphere);
  const mapWidth = x1;

  const mapBounds = svg
    .append("g")
    .attr("class", "map-area")
    .attr(
      "transform",
      `translate(${(width - margin.left - margin.right - mapWidth) / 2}, ${
        chartHeight + marginMap.top
      })`
    );

  const graticuleJson = d3.geoGraticule();

  mapBounds
    .append("path")
    .attr("class", "outline")
    .attr("d", pathGenerator(graticuleJson.outline()));

  mapBounds
    .append("path")
    .attr("class", "graticule")
    .attr("d", pathGenerator(graticuleJson()));

  mapBounds
    .selectAll(".country")
    .data(geoData.features)
    .join("path")
    .attr("class", "country")
    .attr("d", (d) => pathGenerator(d));

  drawCircle(geoData, mapBounds, totalData, circleScale, pathGenerator);

  const brushingMap = (selectedDay) => {
    if (selectedDay) {
      const selectedData = new Map();

      allCountries.forEach((country) => {
        selectedData.set(
          country,
          getCountryTotalByDate(covidDeathData, country, selectedDay)
        );
      });
      drawCircle(geoData, mapBounds, selectedData, circleScale, pathGenerator);
    } else {
      drawCircle(geoData, mapBounds, totalData, circleScale, pathGenerator);
    }
  };

  jSuites.dropdown(document.getElementById("dropdown"), {
    data: regionNames.filter((d) => d !== "date"),
    value: "World",
    autocomplete: true,
    width: "280px",
    onload: () => {
      drawChart(covidDeathData, "World", svg, brushingMap);
    },
    onchange: (d) => {
      drawChart(covidDeathData, d.value, svg, brushingMap);
    },
  });
};

main();
