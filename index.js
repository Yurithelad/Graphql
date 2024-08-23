const signInEndPoint = "https://01.kood.tech/api/auth/signin";
const graphqlEndPoint = "https://01.kood.tech/api/graphql-engine/v1/graphql";

const modal = document.getElementById("loginModal");
const loginBtn = document.getElementById("loginBtn");
const errText = document.getElementById("error");
const logoutBtn = document.getElementById("logoutBtn");

window.onload = () => {
  const token = getCookie();
  if (token) {
    modal.style.display = "none";
    queryEndPontsWithExistingToken(token);
  }
};

const getJwtToken = async (loginData) => {
  try {
    const res = await fetch(signInEndPoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Basic " + btoa(`${loginData.email}:${loginData.password}`),
      },
    });
    if (!res.ok) {
      const err = await res.json();
      errText.innerHTML = err.error;
      throw new Error(`Login failed: ${err.message}`);
    }
    const token = await res.json();
    modal.style.display = "none";
    return token;
  } catch (err) {
    console.error("Error fetching JWT token:", err);
    throw err; // Propagate error
  }
};

const graphqlQuery = async (token) => {
  // under transaction gets the points of the skills the user has
  // under user gets general user info like audit ratio and name
  const query = `
    query {
      skills: transaction(limit: 100, offset: 0, where: {
        _and: [{type: {_ilike: "%skill%"}}]
      }) {
        type
        amount
      }
      user {
        auditRatio
        firstName
        lastName
        email
        createdAt
        login
      }
      xp: transaction(where: {
        _and: [
          {type: {_eq: "xp"}},
          {path: {_nlike: "%piscine%"}}
        ]
      }) {
        type
        path
        createdAt
        amount
        object {
          name
        }
      }
    }
    `;
  try {
    const res = await fetch(graphqlEndPoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Query failed: ${err.message}`);
    }
    const { data } = await res.json();
    setCookie(token);
    return data;
  } catch (err) {
    console.error("Error fetching GraphQL data:", err);
    throw err; // Propagate error
  }
};

const enterHtml = (data) => {
  const { firstName } = data.user[0];
  document.getElementById("hello").innerHTML = `Hello ${firstName}!`;
  generalUserInfo(data);
  skillsInfo(data);
  lineGraph(data);
};

const generalUserInfo = (data) => {
  const userData = data.user[0];
  document.getElementById("info1").innerHTML = `
    <div>full name: ${userData.firstName} ${userData.lastName}</div>
    <div>gitea name: ${userData.login}</div>
    <div>email: ${userData.email}</div>
    <div>created at: ${readAbleDate(userData.createdAt)}</div>
    <div>audit ratio: ${userData.auditRatio.toFixed(3)}</div>
    `;
};

const readAbleDate = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
};

const skillsInfo = (data) => {
  const tran = data.skills;
  const { skillsMap, totalSkillPoints } = getSkillPoints(tran);
  updateDonutChart(skillsMap, totalSkillPoints);
};

const getSkillPoints = (tran) => {
  let skillsMap = new Map();
  let totalSkillPoints = 0;
  tran.forEach((elem) => {
    const skill = elem.type.split("_")[1];
    !skillsMap.has(skill)
      ? skillsMap.set(skill, elem.amount)
      : skillsMap.set(skill, skillsMap.get(skill) + elem.amount);
    totalSkillPoints += elem.amount;
  });
  return { skillsMap, totalSkillPoints };
};

const updateDonutChart = (skillsMap, totalSkillPoints) => {
  const donut = document.getElementById("donut");
  const chartNumber = document.getElementById("chart-number");
  const chartLabel = document.getElementById("chart-label");
  const colors = [
    "#003f5c",
    "#2f4b7c",
    "#665191",
    "#a05195",
    "#d45087",
    "#f95d6a",
    "#ff7c43",
    "#ffa600",
  ];

  chartNumber.innerHTML = totalSkillPoints;
  chartLabel.innerHTML = "Total";

  let colorIndex = 0;
  let precedingSegmentTotalLength = 0;
  const startingoffset = 25;

  // adds segments to the donut chart and calculates how big they should be in the ring
  for (const [key, value] of skillsMap) {
    const percentageOfCircle = (value / totalSkillPoints) * 100;
    const leftOver = 100 - percentageOfCircle;
    let offset = 100 - precedingSegmentTotalLength + startingoffset;
    precedingSegmentTotalLength += percentageOfCircle;

    // idk why normal circle tag doesnt work
    // this will have to do
    let segment = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    segment.setAttribute("class", "donut-segment");
    segment.setAttribute("cx", "21");
    segment.setAttribute("cy", "21");
    segment.setAttribute("r", "16");
    segment.setAttribute("fill", "transparent");
    segment.setAttribute("stroke", colors[colorIndex]);
    segment.setAttribute("stroke-width", "3");
    segment.setAttribute(
      "stroke-dasharray",
      `${percentageOfCircle} ${leftOver}`,
    );
    segment.setAttribute("stroke-dashoffset", `${offset}`);
    segment.style = "transition: stroke-width 0.7s ease;";

    segment.addEventListener("mouseenter", () => {
      segment.style = "stroke-width: 6; transition: stroke-width 0.7s ease;";
      chartNumber.innerHTML = value;
      chartLabel.innerHTML = key;
    });

    segment.addEventListener("mouseleave", () => {
      segment.style = "stroke-width: 3; transition: stroke-width 0.7s ease;";
      chartNumber.innerHTML = totalSkillPoints;
      chartLabel.innerHTML = "Total";
    });

    donut.appendChild(segment);

    colorIndex >= colors.length - 1 ? (colorIndex = 0) : colorIndex++;
  }
};

const lineGraphData = (xpData) => {
  // XP by month
  const aggregateMonthlyXP = xpData.reduce((acc, xpData) => {
    const date = new Date(xpData.createdAt);
    const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; // Format YYYY-MM

    if (!acc[yearMonth]) {
      acc[yearMonth] = 0;
    }

    acc[yearMonth] += xpData.amount;

    return acc;
  }, {});

  // Extract the keys and sort them
  const months = Object.keys(aggregateMonthlyXP);
  months.sort((a, b) => new Date(`${a}-01`) - new Date(`${b}-01`));

  // Find the earliest and latest months
  const startMonth = months[0];
  const endMonth = months[months.length - 1];

  // Generate all months between start and end
  const allMonths = [];
  let current = new Date(`${startMonth}-01`);
  const currentDate = new Date();
  const end = new Date(
    Math.max(
      new Date(`${endMonth}-01`),
      new Date(
        `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-01`,
      ),
    ),
  );

  while (current <= end) {
    const yearMonth = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
    allMonths.push(yearMonth);
    current.setMonth(current.getMonth() + 1);
  }

  // Format the months and years
  const completeMonthlyData = allMonths.map((month) => {
    const [year, monthNum] = month.split("-");
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const formattedMonth = `${monthNames[parseInt(monthNum) - 1]} '${year.slice(-2)}`;
    return {
      month: formattedMonth,
      amount: aggregateMonthlyXP[month] || 0,
    };
  });

  console.log(completeMonthlyData);
  return completeMonthlyData;
};

const lineGraph = (data) => {
  const xpData = data.xp;
  const completeMonthlyData = lineGraphData(xpData);
  const svg = document.getElementById("xp-graph");
  const width = 450;
  const height = 400;

  const margin = { top: 20, right: 20, bottom: 30, left: 50 };
  const graphWidth = width - margin.left - margin.right;
  const graphHeight = height - margin.top - margin.bottom;

  // im using d3 to help generate the line graph
  // Create scales
  const xScale = d3
    .scaleBand()
    .domain(completeMonthlyData.map((d) => d.month))
    .range([0, graphWidth])
    .padding(0.1);

  const yScale = d3
    .scaleLinear()
    .domain([0, d3.max(completeMonthlyData, (d) => d.amount)])
    .nice()
    .range([graphHeight, 0]);

  const line = d3
    .line()
    .x((d) => xScale(d.month) + xScale.bandwidth() / 2)
    .y((d) => yScale(d.amount));

  const g = d3
    .select(svg)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // line path
  g.append("path")
    .datum(completeMonthlyData)
    .attr("class", "line")
    .attr("d", line);

  // circles at data points
  g.selectAll("circle")
    .data(completeMonthlyData)
    .enter()
    .append("circle")
    .attr("class", "circle")
    .attr("cx", (d) => xScale(d.month) + xScale.bandwidth() / 2)
    .attr("cy", (d) => yScale(d.amount))
    .attr("r", 3);

  const tickValues = completeMonthlyData
    .map((d, i) => {
      if (completeMonthlyData.length > 12) {
        return i % 3 === 0 ? d.month : null; // Every 3rd month if there are more than 12 months
      } else {
        return i % 2 === 0 ? d.month : null; // Every other month
      }
    })
    .filter(Boolean); // Remove null values

  // x-axis
  g.append("g")
    .attr("class", "x axis")
    .attr("transform", `translate(0,${graphHeight})`)
    .call(d3.axisBottom(xScale).tickValues(tickValues));

  // y-axis
  g.append("g")
    .attr("class", "y axis")
    .call(
      d3.axisLeft(yScale).tickFormat((d) => {
        return d >= 1000 ? `${d / 1000}kB` : d; // if bigger than 1000 will turn it into 1kB
      }),
    );
};

const queryEndPontsWithExistingToken = async (token) => {
  const data = await graphqlQuery(token);
  enterHtml(data);
};

const queryEndPoints = async (email, password) => {
  try {
    const loginData = { email, password };
    const token = await getJwtToken(loginData);
    const data = await graphqlQuery(token);
    enterHtml(data);
  } catch (err) {
    console.error("Error querying endpoints:", err);
    // Optionally, update the UI to indicate an error
  }
};

const setCookie = (value) => {
  let expires = "";
  const date = new Date();
  date.setTime(date.getTime() + 60 * 60 * 1000);
  expires = "expires=" + date.toUTCString();
  document.cookie = `token=${encodeURIComponent(value)}; ${expires}; path=/; Secure; SameSite=Strict`;
};

const getCookie = () => {
  const nameEQ = "token=";
  const ca = document.cookie.split(";");
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === " ") c = c.substring(1);
    if (c.indexOf(nameEQ) === 0)
      return decodeURIComponent(c.substring(nameEQ.length, c.length));
  }
  return null;
};

const eraseCookie = () =>
  (document.cookie = `token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; Secure; SameSite=Strict`);

loginBtn.addEventListener("click", () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  queryEndPoints(email, password);
});

logoutBtn.addEventListener("click", () => {
  eraseCookie();
  location.reload();
});
