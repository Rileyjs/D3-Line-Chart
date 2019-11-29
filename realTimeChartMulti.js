'use strict'

// from https://bl.ocks.org/boeric/6a83de20f780b42fadb9
function realTimeChartMulti () {
  var version = '0.1.0'
  var datum; var data; var dataLists
  var maxSeconds = 300; var pixelsPerSecond = 10
  var svgWidth = 700; var svgHeight = 300
  var margin = { top: 20, bottom: 20, left: 100, right: 30, topNav: 10, bottomNav: 20 }
  var dimension = { chartTitle: 20, xAxis: 20, yAxis: 20, xTitle: 20, yTitle: 20, navChart: 70 }
  var maxY = 100; var minY = 0
  var chartTitle; var yTitle; var xTitle
  var drawXAxis = true; var drawYAxis = true; var drawNavChart = true
  var border
  var selection
  var barId = 0
  var yDomain = []
  var debug = false
  var barWidth = 5
  var halted = false
  var x; var y
  var xNav; var yNav
  var width; var height
  var widthNav; var heightNav
  var xAxisG; var yAxisG
  var xAxis; var yAxis
  var svg

  // Prep dataLists formatting
  dataLists = { times: [],
    series: [

    ] }

  // create the chart
  var chart = function (s) {
    selection = s
    if (selection === undefined) {
      console.error('selection is undefined')
      return
    };

    // process titles
    chartTitle = chartTitle || ''
    xTitle = xTitle || ''
    yTitle = yTitle || ''

    // compute component dimensions
    var chartTitleDim = chartTitle === '' ? 0 : dimension.chartTitle
    var xTitleDim = xTitle === '' ? 0 : dimension.xTitle
    var yTitleDim = yTitle === '' ? 0 : dimension.yTitle
    var xAxisDim = !drawXAxis ? 0 : dimension.xAxis
    var yAxisDim = !drawYAxis ? 0 : dimension.yAxis
    var navChartDim = !drawNavChart ? 0 : dimension.navChart

    // compute dimension of main and nav charts, and offsets
    var marginTop = margin.top + chartTitleDim
    height = svgHeight - marginTop - margin.bottom - chartTitleDim - xTitleDim - xAxisDim - navChartDim + 30
    heightNav = navChartDim - margin.topNav - margin.bottomNav
    var marginTopNav = svgHeight - margin.bottom - heightNav - margin.topNav
    width = svgWidth - margin.left - margin.right
    widthNav = width

    // append the svg
    svg = selection.append('svg')
      .attr('width', svgWidth)
      .attr('height', svgHeight)
      .style('border', function (d) {
        if (border) return '1px solid lightgray'
        else return null
      })

    // Handles events when mouse is moved
    function moved () {
      d3.event.preventDefault()
      const yMouse = y.invert(d3.event.layerY)
      const xMouse = x.invert(d3.event.layerX)
      console.log('x:', xMouse, 'y:', yMouse)
    }

    // create main group and translate
    var main = svg.append('g')
      .attr('transform', 'translate (' + margin.left + ',' + marginTop + ')')
      .on('mousemove', moved)

    // define clip-path
    main.append('defs').append('clipPath')
      .attr('id', 'myClip')
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', height)

    // create chart background
    main.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', height)
      .style('fill', '#f5f5f5')

    // note that two groups are created here, the latter assigned to barG;
    // the former will contain a clip path to constrain objects to the chart area;
    // no equivalent clip path is created for the nav chart as the data itself
    // is clipped to the full time domain
    var barG = main.append('g')
      .attr('class', 'barGroup')
      .attr('transform', 'translate(0, 0)')
      .attr('clip-path', 'url(#myClip')
      .append('g')

    // add group for x axis
    xAxisG = main.append('g')
      .attr('class', 'x axis')
      .attr('transform', 'translate(0,' + height + ')')

    // add group for y axis
    yAxisG = main.append('g')
      .attr('class', 'y axis')

    // in x axis group, add x axis title
    xAxisG.append('text')
      .attr('class', 'title')
      .attr('x', width / 2)
      .attr('y', 25)
      .attr('dy', '.71em')
      .text(function (d) {
        var text = xTitle === undefined ? '' : xTitle
        return text
      })

    // in y axis group, add y axis title
    yAxisG.append('text')
      .attr('class', 'title')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', -margin.left + 15) // -35
      .attr('dy', '.71em')
      .text(function (d) {
        var text = yTitle === undefined ? '' : yTitle
        return text
      })

    // in main group, add chart title
    main.append('text')
      .attr('class', 'chartTitle')
      .attr('x', width / 2)
      .attr('y', -20)
      .attr('dy', '.71em')
      .text(function (d) {
        var text = chartTitle === undefined ? '' : chartTitle
        return text
      })

    // define main chart scales
    x = d3.time.scale().range([0, width])
    y = d3.scale.linear().domain([0, 100]).range([height, 0])

    // define main chart axis
    xAxis = d3.svg.axis().orient('bottom')
    yAxis = d3.svg.axis().orient('left')

    // add nav chart
    var nav = svg.append('g')
      .attr('transform', 'translate (' + margin.left + ',' + marginTopNav + ')')

    // add nav background
    nav.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', heightNav)
      .style('fill', '#F5F5F5')
      .style('shape-rendering', 'crispEdges')
      .attr('transform', 'translate(0, 0)')

    // add group to data items
    var navG = nav.append('g')
      .attr('class', 'nav')

    // add group to hold nav x axis
    // please note that a clip path has yet to be added here (tbd)
    var xAxisGNav = nav.append('g')
      .attr('class', 'x axis')
      .attr('transform', 'translate(0,' + heightNav + ')')

    // define nav chart scales
    xNav = d3.time.scale().range([0, widthNav])
    yNav = d3.scale.ordinal().domain(yDomain).rangeRoundPoints([heightNav, 0], 1)

    // define nav axis
    var xAxisNav = d3.svg.axis().orient('bottom')

    // compute initial time domains...
    var ts = new Date().getTime()

    // first, the full time domain
    var endTime = new Date(ts)
    var startTime = new Date(endTime.getTime() - maxSeconds * 1000)
    var interval = endTime.getTime() - startTime.getTime()

    // then the viewport time domain (what's visible in the main chart and the viewport in the nav chart)
    var endTimeViewport = new Date(ts)
    var startTimeViewport = new Date(endTime.getTime() - width / pixelsPerSecond * 1000)
    var intervalViewport = endTimeViewport.getTime() - startTimeViewport.getTime()
    var offsetViewport = startTimeViewport.getTime() - startTime.getTime()

    // set the scale domains for main and nav charts
    x.domain([startTimeViewport, endTimeViewport])
    xNav.domain([startTime, endTime])

    // update axis with modified scale
    xAxis.scale(x)(xAxisG)
    yAxis.scale(y)(yAxisG)
    xAxisNav.scale(xNav)(xAxisGNav)

    // create brush (moveable, changable rectangle that determines the time domain of main chart)
    var viewport = d3.svg.brush()
      .x(xNav)
      .extent([startTimeViewport, endTimeViewport])
      .on('brush', function () {
        // get the current time extent of viewport
        var extent = viewport.extent()
        startTimeViewport = extent[0]
        endTimeViewport = extent[1]

        // compute viewport extent in milliseconds
        intervalViewport = endTimeViewport.getTime() - startTimeViewport.getTime()
        offsetViewport = startTimeViewport.getTime() - startTime.getTime()

        // handle invisible viewport
        if (intervalViewport === 0) {
          intervalViewport = maxSeconds * 1000
          offsetViewport = 0
        }

        // update the x domain of the main chart
        x.domain(viewport.empty() ? xNav.domain() : extent)

        // update the x axis of the main chart
        xAxis.scale(x)(xAxisG)

        // update display
        refresh()
      })

    // create group and assign to brush
    var viewportG = nav.append('g')
      .attr('class', 'viewport')
      .call(viewport)
      .selectAll('rect')
      .attr('height', heightNav)

    // initial invocation; update display
    data = []
    refresh()

    // function to refresh the viz upon changes of the time domain
    // (which happens constantly), or after arrival of new data, or at init
    function refresh () {
      // process data to remove too late data items
      console.log('Refresh prefilter data:', data)
      data = data.filter(function (d) {
        if (d.time.getTime() > startTime.getTime()) return true
      })
      console.log('Refresh postfilter data:', data)

      // TODO add timeout filtering to dataLists

      console.log('Top of refresh dataLists:', dataLists)
      // Remove old lines first
      d3.selectAll('path.line').remove()

      // Adding lines
      var myLine = d3.svg.line()
        .x(function (d) { return x(d.time) })
        .y(function (d) { return y(d.value) })

      // Keys to have lines made
      var keysToUse = ['cab_temp_1', 'fwd_voltage']
      keysToUse.map(function (telemKey) {
        var tempList = []
        // Filter out wanted telemetry strings
        for (var dataPoint of data) {
          if (dataPoint.category === telemKey) {
            tempList.push(dataPoint)
          }
        }
        // console.log('tempList:', tempList)
        var linesElement = main.append('g')
          .append('path')
          .attr('fill', 'none')
          .attr('stroke-width', 1.5)
          .attr('d', myLine(tempList))
          .attr('class', 'line')
        if (tempList.length !== 0) {
          linesElement.attr('stroke', tempList[0].color)
        }
      })

      // determine number of categories
      if (debug) console.log('yDomain', yDomain)

      // here we bind the new data to the main chart
      // note: no key function is used here; therefore the data binding is
      // by index, which effectivly means that available DOM elements
      // are associated with each item in the available data array, from
      // first to last index; if the new data array contains fewer elements
      // than the existing DOM elements, the LAST DOM elements are removed;
      // basically, for each step, the data items "walks" leftward (each data
      // item occupying the next DOM element to the left);
      // This data binding is very different from one that is done with a key
      // function; in such a case, a data item stays "resident" in the DOM
      // element, and such DOM element (with data) would be moved left, until
      // the x position is to the left of the chart, where the item would be
      // exited
      var updateSel = barG.selectAll('.bar')
        .data(data)

      // remove items
      updateSel.exit().remove()

      // add items
      updateSel.enter()
        .append(function (d) {
          if (debug) { console.log('d', JSON.stringify(d)) }
          if (d.type === undefined) console.error(JSON.stringify(d))
          var type = d.type || 'circle'
          var node = document.createElementNS('http://www.w3.org/2000/svg', type)
          return node
        })
        .attr('class', 'bar')
        .attr('id', function () {
          return 'bar-' + barId++
        })

      // update items; added items are now part of the update selection
      updateSel
        .attr('x', function (d) {
          var retVal = null
          switch (getTagName(this)) {
            case 'rect':
              var size = d.size || 6
              retVal = Math.round(x(d.time) - size / 2)
              break
            default:
          }
          return retVal
        })
        .attr('y', function (d) {
          var retVal = null
          switch (getTagName(this)) {
            case 'rect':
              var size = d.size || 6
              retVal = y(d.category) - size / 2
              break
            default:
          }
          return retVal
        })
        .attr('cx', function (d) {
          var retVal = null
          switch (getTagName(this)) {
            case 'circle':
              retVal = Math.round(x(d.time))
              break
            default:
          }
          return retVal
        })
        .attr('cy', function (d) {
          var retVal = null
          switch (getTagName(this)) {
            case 'circle':
              retVal = y(d.value)
              break
            default:
          }
          return retVal
        })
        .attr('r', function (d) {
          var retVal = null
          switch (getTagName(this)) {
            case 'circle':
              retVal = d.size / 2
              break
            default:
          }
          return retVal
        })
        .attr('width', function (d) {
          var retVal = null
          switch (getTagName(this)) {
            case 'rect':
              retVal = d.size
              break
            default:
          }
          return retVal
        })
        .attr('height', function (d) {
          var retVal = null
          switch (getTagName(this)) {
            case 'rect':
              retVal = d.size
              break
            default:
          }
          return retVal
        })
        .style('fill', function (d) { return d.color || 'black' })
      // .style("stroke", "orange")
      // .style("stroke-width", "1px")
      // .style("stroke-opacity", 0.8)
        .style('fill-opacity', function (d) { return d.opacity || 1 })

      // create update selection for the nav chart, by applying data
      var updateSelNav = navG.selectAll('circle')
        .data(data)

      // remove items
      updateSelNav.exit().remove()

      // add items
      updateSelNav.enter().append('circle')
        .attr('r', 1)
        .attr('fill', 'black')

      // added items now part of update selection; set coordinates of points
      updateSelNav
        .attr('cx', function (d) {
          return Math.round(xNav(d.time))
        })
        .attr('cy', function (d) {
          return yNav(d.value)
        })
    } // end refreshChart function

    function getTagName (that) {
      var tagName = d3.select(that).node().tagName
      return (tagName)
    }

    // function to keep the chart "moving" through time (right to left)
    setInterval(function () {
      if (halted) return

      // get current viewport extent
      var extent = viewport.empty() ? xNav.domain() : viewport.extent()
      var interval = extent[1].getTime() - extent[0].getTime()
      var offset = extent[0].getTime() - xNav.domain()[0].getTime()

      // compute new nav extents
      endTime = new Date()
      startTime = new Date(endTime.getTime() - maxSeconds * 1000)

      // compute new viewport extents
      startTimeViewport = new Date(startTime.getTime() + offset)
      endTimeViewport = new Date(startTimeViewport.getTime() + interval)
      viewport.extent([startTimeViewport, endTimeViewport])

      // update scales
      x.domain([startTimeViewport, endTimeViewport])
      xNav.domain([startTime, endTime])

      // update axis
      xAxis.scale(x)(xAxisG)
      xAxisNav.scale(xNav)(xAxisGNav)

      // refresh svg
      refresh()
    }, 200)

    // end setInterval function

    return chart
  } // end chart function

  // chart getters/setters

  // new data item (this most recent item will appear
  // on the right side of the chart, and begin moving left)
  chart.datum = function (incomingData) {
    console.log('chart.datum passed argument', incomingData)
    if (arguments.length === 0) {
      console.log('Data is empty returning datum')
      return datum
    }
    datum = incomingData
    console.log('data before adding new datum', data)
    console.log('datum to be added to data', datum)
    data.push(datum)
    console.log('data after adding datum:', data)
    console.log('datum added to data', datum)

    // Parse incoming data
    // Format data to work with moved function
    console.log('Length of data', data.length)
    var d = datum
    // console.log('d of data:', d)
    // console.log('length of times:', dataLists.times.length)
    if (dataLists.times.length === 0) {
      dataLists.times.push(d.time)
      console.log('First time element added')
    }

    // Check if the timestamp has already been recorded
    // if not add it to the mater time list
    if (dataLists.times[dataLists.times.length - 1].getTime() !== d.time.getTime()) {
      dataLists.times.push(d.time)
    }
    var found = false
    for (var i = 0; i < dataLists.series.length; i++) {
      if (dataLists.series[i].category === d.category) {
        // console.log("Matching cat found:", dataLists.series[i])
        dataLists.series[i].series.push(d.value)
        found = true
        break
      }
    }
    if (!found) {
      // console.log("No match found", dataLists.series)
      dataLists.series.push({ category: d.category,
        series: [d.value] })
    }

    // Add in the value into the dataLists telemetry

    // for (test == dataLists.times.includes(d.time)) {
    //   //checking for the time to occur in both dataLists and data
    //   if (test == true)
    //   //do nothing
    //   if (test == false)
    //   //add all of the cat values to the series
    // }

    console.log('Newley formated data', dataLists)
    return chart
  }

  // svg width
  chart.width = function (_) {
    if (arguments.length === 0) return svgWidth
    svgWidth = _
    return chart
  }

  // svg height
  chart.height = function (_) {
    if (arguments.length === 0) return svgHeight
    svgHeight = _
    return chart
  }

  // svg border
  chart.border = function (_) {
    if (arguments.length === 0) return border
    border = _
    return chart
  }

  // chart title
  chart.title = function (_) {
    if (arguments.length === 0) return chartTitle
    chartTitle = _
    return chart
  }

  // x axis title
  chart.xTitle = function (_) {
    if (arguments.length === 0) return xTitle
    xTitle = _
    return chart
  }

  // y axis title
  chart.yTitle = function (_) {
    if (arguments.length === 0) return yTitle
    yTitle = _
    return chart
  }

  // yItems (can be dynamically added after chart construction)
  chart.yDomain = function (_) {
    if (arguments.length === 0) return yDomain
    yDomain = _
    if (svg) {
      // update the y ordinal scale
      // y = d3.scale.ordinal().domain(yDomain).rangeRoundPoints([height, 0], 1)
      y = d3.scale.linear().domain([0, 100]).range([height, 0])
      // update the y axis
      yAxis.scale(y)(yAxisG)
      // update the y ordinal scale for the nav chart
      yNav = d3.scale.ordinal().domain(yDomain).rangeRoundPoints([heightNav, 0], 1)
      yNav = d3.scale.linear().domain([0, 100]).range([heightNav, 0])
    }
    return chart
  }

  // debug
  chart.debug = function (_) {
    if (arguments.length === 0) return debug
    debug = _
    return chart
  }

  // halt
  chart.halt = function (_) {
    if (arguments.length === 0) return halted
    halted = _
    return chart
  }

  // version
  chart.version = version

  return chart
} // end realTimeChart function
