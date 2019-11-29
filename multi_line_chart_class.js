// import * as d3 from 'd3'

class MultiLineChart {
  constructor (id, width, additionalConfig) {
    this.config = {
      id: id,
      lineColor: '#40C669', // Default non AVG line color
      width: width, // Overall max width of the entire chart
      height_ratio: 0.28,
      graphHeight: null, // Computed size of the graphing area
      graphWidth: null,
      yMinVal: 0,
      yMaxVal: 70,
      lineCurve: d3.curveBasis,
      main_line_stroke_width: 3,
      main_line_fill: 'none',
      yUnit: 'V',
      collapsedLimit: 50, // How many seconds should be displayed when in collapsed view
      expandedLimit: 100, // Max records to store in memory and how many seconds should be displayed with in expanded view
      currentLimit: 50, // How many seconds are currently being displayed
      scaleChangeAnimationDuration: 500, // Any one off transitions created run at this speed
      cycleAnimationDuration: 1000, // How long each animation cycle should be when animating continuously

      margin: {
        top: 10,
        bottom: 10,
        left: 35,
        right: 10
      },
      dimension: {
        xAxis: 20,
        yAxis: 20
      },
      rewind: 10, // Amount of seconds for the chart to be rewound
      endTime: new Date().getTime(), // The right most timestamp on the displayed chart
      startTime: null // Dependant on endTime and cannot be set in the dict initialization
    }
    // Update config settings right away
    this.updateConfig(additionalConfig)
    this.config.startTime = this.config.endTime - (this.config.currentLimit * 1000)

    // Flags controlling animation behavior
    // Used to ensure only one animation cycle is running
    this.currentlyAnimating = true
    // if anything in here is true the animation cycle breaks
    this.flags = {
      zoomedIn: false,
      hidden: false,
      externalStop: false,
      rewound: false
    }

    this.data = {}
    this.config.graphHeight = (this.config.width * this.config.height_ratio) - this.config.margin.bottom - this.config.dimension.xAxis
    this.config.graphWidth = this.config.width - this.config.margin.left - this.config.margin.right
    // Scales to be used for translating data to pixels and back
    this.x = d3.scaleTime()
      .range([0, this.config.graphWidth])
      .domain([this.config.startTime, this.config.endTime])
    this.y = d3.scaleLinear()
      .domain([this.config.yMinVal, this.config.yMaxVal])
      .range([this.config.graphHeight, 0])

    this.myLine = d3.line()
      .curve(this.config.lineCurve)
      .x(d => this.x(d.time))
      .y(d => this.y(d.value))

    // Define main chart axis
    this.xAxis = d3.axisBottom().tickSize(-this.config.graphHeight)
    this.yAxis = d3.axisLeft().tickSize(-this.config.graphWidth).ticks(5).tickFormat(d => `${d}${this.config.yUnit}`)

    // Chart section creation
    this.parent = d3.select(`#${id}`)

    // Testing buttons, should not escape into any production or demo
    this.button = this.parent.append('button')
      .on('click', _ => this.resume())
      .text('start')
    this.button2 = this.parent.append('button')
      .on('click', _ => this.pause())
      .text('stop')
    this.button3 = this.parent.append('button')
      .on('click', _ => this.rewind())
      .text('rewind!')

    // All encompassing svg element
    this.svg = this.parent.append('svg')
      .attr('class', `linechart ${id}`)
      .attr('viewBox', `0 0 ${this.config.width} ${this.config.width * this.config.height_ratio}`)
      .attr('overflow', 'visible')

    // Charting area
    this.mainChart = this.svg.append('g')
      .attr('class', `mainChart ${id}`)
      .attr('transform', `translate (${this.config.margin.left}, ${this.config.margin.top})`)
      .attr('position', 'relative')
      // Logic supporting mouse over tooltip
      .on('mousenter', _ => {
        // TODO this never is triggered, even while mouseleave and mousemove are
        console.log('Entered MOUSENTER')
        this.toolTipG.attr('display', null)
      })
      .on('mouseleave', _ => {
        console.log('Mouse left')
        this.toolTipG.attr('display', 'none')
        this.toolTipLineG.attr('display', 'none')
      })
      .on('mousemove', _ => {
        this.toolTipG.attr('display', null)
        this.toolTipLineG.attr('display', null)
        d3.event.preventDefault()

        // Get current mouse position in pixels relative to main chart
        const yMouseRaw = d3.mouse(this.mainChart.node())[1]
        const xMouseRaw = d3.mouse(this.mainChart.node())[0]

        // Convert them back to the telemetry time and value
        const yMouse = this.y.invert(yMouseRaw)
        const xMouse = this.x.invert(xMouseRaw)

        // Currently assumes that all telemetry times match
        // no error checking is done to verify that
        // simply checks the first key's time stamps
        const telemKeys = Object.keys(this.data)

        // Setting up a binary search for closest time
        const timeBisector = d3.bisector(d => d.time)
        let timeLoc = timeBisector.left(this.data[telemKeys[0]], xMouse)
        if (timeLoc === 0) {
          // TODO if the data no longer exists in the structure, the line draws in the last known spot and sticks
          // Stop's tooltip from showing up if mousing over an empty section
          this.toolTipG.style('display', 'none')
          return
        }

        // Find the closest spot on the X axis
        // Jumps to the nearest point
        const leftTimeSpot = Math.abs(this.data[telemKeys[0]][timeLoc - 1].time - xMouse)
        const rightTimeSpot = Math.abs(this.data[telemKeys[0]][timeLoc].time - xMouse)
        if (leftTimeSpot < rightTimeSpot) {
          timeLoc = timeLoc - 1
        }

        // Add a vertical line to the mouse over
        this.toolTipLineG.selectAll('.mouseOverLine')
          .data([this.data[telemKeys[0]][timeLoc]]) // Sending a single item so it needs to be in an array
          .join(
            enter => enter.append('line')
              .attr('class', `mouseOverLine ${this.config.id}`)
              .attr('x1', d => this.x(d.time))
              .attr('x2', d => this.x(d.time))
              .attr('y1', this.config.graphHeight)
              .attr('y2', 0)
              .attr('stroke-width', 2)
              .attr('stroke', '#4A90E2')
              .attr('stroke-dasharray', '4'),
            update => update
              .attr('x1', d => this.x(d.time))
              .attr('x2', d => this.x(d.time))
          )

        // Build the tooltip string, each index is a row
        const tooltipString = [] // holds all text for tooltip
        const closestRange = -1 // temp variable for comparing which point is closest to mouse y position
        const closestName = '' // the text string of the data point closest to the mouse, for sorting on and bolding later
        for (const telemKey of telemKeys) {
          // Save the timestamp to append to start of array later
          // Add telemetry to tooltipString as a string "<telemetry name>: <value>"
          tooltipString.push(`${telemKey}: ${this.data[telemKey][timeLoc].value.toFixed(2)}`)
        }
        // Sort the tooltipString, by telemetry value
        tooltipString.sort()
        tooltipString.unshift(`TimeStamp: ${new Date(this.data[telemKeys[0]][timeLoc].time).toString().substr(16, 8)}`)

        // The above mouse coordinated are relative to the main graphing area element
        // We need to tie the tool tip to the parent svg element so it can overlap the charting are bounds
        const parentYMouseRaw = d3.mouse(this.svg.node())[1]
        const parentXMouseRaw = d3.mouse(this.svg.node())[0]

        // Move the box to the mouse and modify its contents
        this.toolTipBox.attr('transform', `translate(${parentXMouseRaw}, ${parentYMouseRaw})`)
          .style('display', null)
          .style('pointer-events', 'none')

        const tooltipPath = this.toolTipBox.selectAll('path')
          .data([null])
          .join('path')
          .attr('class', `tooltipBoundingPath ${this.config.id}`)
          .attr('fill', 'white')
          .attr('stroke', 'black')
          .attr('stroke-width', 2)

        const tooltipText = this.toolTipBox.selectAll('text')
          .data([null])
          .join('text')
          .attr('class', `tooltipText ${this.config.id}`)

        // Create a column of tspan elements for key names:
        const tooltipTspanKeys = tooltipText.selectAll('tspan')
          .filter('.keys')
          .data(tooltipString)
          .join('tspan')
          .attr('class', `keys ${this.config.id}`)
          .attr('x', 0)
          .attr('y', (d, i) => `${i * 1.11}em`)
          .attr('font-weight', d => d == closestName ? 'bold' : 'normal')
          .attr('font-size', '10px')
          .text(d => {
            var title = d.split(' ')[0]
            title = title.split('_').join(' ')
            if (title.substring(0, 3) === 'AVG') {
              return 'Avg. ' + title.substring(4)
            } else {
              return title
            }
          })

        // Create a column of tspan elements for values
        const tooltipTspanVals = tooltipText.selectAll('tspan')
          .filter('.values')
          .data(tooltipString)
          .join('tspan')
          .attr('class', `values ${this.config.id}`)
          .attr('x', 85)
          .attr('y', (d, i) => `${i * 1.11}em`)
          .attr('font-size', '10px')
          .attr('font-weight', d => d == closestName ? 'bold' : 'normal')
          .text(d => d.split(' ')[1])

        // Get bounding points of the text
        const textBoxLayout = tooltipText.node().getBBox()
        // Apply additional formatting now that we know the size of the tooltip box
        // Centers all the text below the mouse
        tooltipText.attr('transform', `translate(${-textBoxLayout.width / 2},${15 - textBoxLayout.y})`)
        // Generates the nice box with a small triangle at the mouse
        tooltipPath.attr('d', `M${-textBoxLayout.width / 2 - 10},5H-5l5,-5l5,5H${textBoxLayout.width / 2 + 10}v${textBoxLayout.height + 20}h-${textBoxLayout.width + 20}z`)
      })
      .on('dblclick', _ => {
        // Reset brush zoom, and then start animation cycles up
        this.flags.zoomedIn = false
        this.config.endTime = new Date().getTime()
        this.config.startTime = this.config.endTime - (this.config.currentLimit * 1000)
        this.x.domain([this.config.startTime, this.config.endTime])

        this.draw()
      })

    // Clip-path so telemetry elements are not displayed when leaving the graph
    this.mainChart.append('defs').append('clipPath')
      .attr('class', 'mainChartClip')
      .attr('id', `myClip${this.config.id}`)
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', this.config.graphWidth)
      .attr('height', this.config.graphHeight)

    // Clip-path for axis, to hide numbers from appearing to far outside of the chart
    this.mainChart.append('defs').append('clipPath')
      .attr('class', 'xAxisClip')
      .attr('id', `axisClip${this.config.id}`)
      .append('rect')
      .style('opacity', 0)
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', this.config.graphWidth + 10)
      .attr('height', this.config.graphHeight + 10)

    // Background of charting area
    this.mainChart.append('rect')
      .attr('class', `lineChartBackground ${id}`)
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', this.config.graphWidth)
      .attr('height', this.config.graphHeight)
      .attr('fill', 'none') // TODO Move to CSS

    // Tooltip grouping
    this.toolTipLineG = this.mainChart.append('g')
      .attr('class', `mouseOverToolTipLine #{this.config.id}`)
    this.toolTipG = this.svg.append('g')
      .attr('class', `mouseOverToolTipG ${this.config.id}`)
    this.toolTipBox = this.toolTipG.append('g')
      .attr('class', `mouseOverToolTipBox ${this.config.id}`)

    // Brush for zooming into the graph
    this.zoomBrush = d3.brushX()
      // Sets the brushable extent [[x0,y0],[x1,y1]]. 0 is top left corner, 1 is bottom right. returns brush
      .extent([[0, 0], [this.config.graphWidth, this.config.graphHeight]])
      // Dictate what happens upon releasing the brush
      .on('end', d => {
        // Stops anything from happening when brush is being cleared
        if (!d3.event.selection) {
          return
        }

        this.flags.zoomedIn = true
        // Reset the drawing domain to reflect the highlighted area
        const extent = d3.brushSelection(this.mainChart.select('.brush').node())
        extent[0] = this.x.invert(extent[0])
        extent[1] = this.x.invert(extent[1])
        this.x.domain(extent)

        // Animate lines and axis to new domain
        this.draw()

        // Remove the visible brush
        this.brushG.call(this.zoomBrush.move, null)
      })
      .on('start', d => {
        this.toolTipG.attr('display', 'none')
        this.toolTipLineG.attr('display', 'none')
      })

    // Locations for background grid lines
    this.backgroundLinesG = this.mainChart.append('g')
      .attr('class', 'backgroundGridLines')
      .attr('pointer-events', 'none')

    // Add brush grouping
    this.brushG = this.mainChart.append('g')
      .attr('class', 'brush')
      .attr('pointer-events', 'none')
      .call(this.zoomBrush)

    // x axis
    this.xAxisG = this.mainChart.append('g')
      .attr('clip-path', `url(#axisClip${this.config.id})`)
      .append('g') // Another sub group has to be added so the transformation does not impact the clip
      .attr('class', `x axis ${id}`)
      .attr('pointer-events', 'none')
      .attr('transform', `translate(0, ${this.config.graphHeight})`)
      .attr('opacity', 1)

    // y axis
    this.yAxisG = this.mainChart.append('g')
      .attr('pointer-events', 'none')
      .attr('class', `y axis ${id}`)

    // grouping for lines being graphed
    this.dataAreaG = this.mainChart.append('g')
      .attr('class', `dataLines ${id}`)
      .attr('clip-path', `url(#myClip${this.config.id})`)
      .attr('pointer-events', 'none')

    // Adding axis
    this.x.domain([this.config.startTime, this.config.endTime])
    this.xAxis.scale(this.x)(this.xAxisG)
    this.yAxis.scale(this.y)(this.yAxisG)
  }

  // Update visual elements to reflect current data
  refresh () {
    // Add grid lines to the background
    this.backgroundLinesG.call(
      d => d3.axisBottom(this.x)
        .ticks(5)
        .tickSize(-this.config.height)
        .tickFormat(''))

    this.dataAreaG.selectAll('path')
      .data(d3.entries(this.data)) // Compresses dict into array before passing it in
      // All d consist of {key: telem name, value: list of values}
      .join(enter => enter.append('path')
        .attr('class', d => `telemetryLine ${this.config.id} ${d.key}`)
        .attr('clip-path', `url(#myClip${this.config.id})`)
        .attr('stroke-width', d => {
          if (d.key.substring(0, 3) === 'AVG') {
            return this.config.main_line_stroke_width * 0.7
          } else {
            return this.config.main_line_stroke_width
          }
        })
        .attr('fill', 'none')
        .attr('d', d => this.myLine(d.value))
        .attr('stroke', d => {
          if (d.key.substring(0, 3) === 'AVG') {
            return '#4A90E2'
          } else {
            return this.config.lineColor
          }
        })
        .attr('opacity', 0)
        .call(enter => enter.transition()
          .transition()
          .duration(500)
          .attr('opacity', d => {
            if (d.key.substring(0, 3) === 'AVG') {
              return 0.5
            } else {
              return 1
            }
          })
          .on('end', _ => {
            this.tick(this) // This animation start is only called when data is first filled in
          })
        )
      )
      // New data has been added, if there is not already an animation cycle going attempt to start one
    if (!this.currentlyAnimating) {
      this.tick(this)
    }
  }

  update (newData) {
    // Add new data
    newData.map(d => {
      d.time = d.time.getTime()
      if (!(d.category in this.data)) {
        // Telemetry doesn't exist and needs to be added
        this.data[d.category] = [d]
      } else {
        // Telemetry already exists and needs to be added in order
        // does not assume data comes in order
        const index = d3.bisect(this.data[d.category], d.time)
        this.data[d.category].splice(index, 0, d) // insert "x" at index, deleting 0 elements
      }
    })
    // Prune old data
    const cutOffTime = new Date().getTime() - (this.config.expandedLimit * 1000)
    Object.keys(this.data).map(telem => {
      try {
        while (this.data[telem][0].time < cutOffTime) {
          this.data[telem].shift()
        }
      } catch (error) {
        console.log(error)
      }
    })

    // Determine if the chart is visible or not, it it is not then do not update/animate
    // Looks up the parent tree until it finds the container element then checks its properties
    var tempNode = this.parent.node().parentNode
    while (!tempNode.classList.contains('toggle-container')) {
      tempNode = tempNode.parentNode
    }
    // Determine no halting flags are set
    const keepRunning = Object.values(this.flags).every(flag => flag === false)
    // Chart is on a hidden tab and should not be updating svg elements
    if (tempNode.classList.contains('hidden-container')) {
      // If the chart is not paused then fade it out for a clean fade in on tab switch
      if (keepRunning) {
        this.dataAreaG.selectAll('path')
          .attr('opacity', 0)
        this.xAxisG.attr('opacity', 0)
      }

      this.flags.hidden = true
      return
    }

    // If flags.hidden is true that means the tab was just reopened
    if (this.flags.hidden) {
      this.flags.hidden = false

      // If the chart is not paused for another reason then update the scales to give it a nice fade in
      if (Object.values(this.flags).every(flag => flag === false)) {
        this.config.endTime = new Date().getTime()
        this.config.startTime = this.config.endTime - (this.config.currentLimit * 1000)
        this.x.domain([this.config.startTime, this.config.endTime])
        this.xAxisG.call(this.xAxis)
      }
    }

    // Pass the new data into the DOM
    this.refresh()
  }

  // Handles transitions when changing from one scope of time to another
  // uses more expensive 'd' transitions so should only be used for one offs
  // will always attempt to start the animation cycle at the end by calling tick()
  // calling code is responsible for:
  //    - setting any animation flags prior to calling
  //    - Updating start and end time
  //    - Updating the domain of x
  draw () {
    // Stop updating data from interrupting the transition
    this.currentlyAnimating = true

    // Move all elements to already determined scales
    this.xAxisG
      .transition()
      .duration(this.config.scaleChangeAnimationDuration)
      .ease(d3.easeElastic)
      .call(this.xAxis)

    this.dataAreaG.selectAll('path')
      .transition()
      .duration(this.config.scaleChangeAnimationDuration)
      .ease(d3.easeElastic)
      .attr('d', d => this.myLine(d.value))
      .on('end', _ => this.tick(this))
  }

  // Handles continuous chart rolling
  // Because of how .call and .on process the keyword 'this' will not reference the class
  // so it must be passed into the function
  // TODO double check on behavior
  tick (self) {
    'use strict'
    // If any flags are set to true animation cycle should stop
    if (!Object.values(self.flags).every(flag => flag === false)) {
      this.currentlyAnimating = false
      return
    }
    this.currentlyAnimating = true

    // Update time scales current time
    self.config.endTime = new Date().getTime()
    self.config.startTime = self.config.endTime - (self.config.currentLimit * 1000)
    self.x.domain([self.config.startTime, self.config.endTime])

    // Animate X axis
    self.xAxisG
      .transition()
      .duration(self.config.cycleAnimationDuration)
      .ease(d3.easeLinear)
      .attr('opacity', 1)
      .call(self.xAxis)

    // Animate lines
    self.dataAreaG.selectAll('path')
      .attr('d', d => self.myLine(d.value))
      .attr('transform', null)
      .transition()
      .ease(d3.easeLinear)
      .duration(self.config.cycleAnimationDuration)
      .attr('opacity', d => {
        if (d.key.substring(0, 3) === 'AVG') {
          return 0.5
        } else {
          return 1
        }
      })
      .attr('transform', 'translate(' + (self.x(0) - self.x(1000)) + ')')
      .on('end', _ => self.tick(self))

    // TODO Trying to translate the parent element results in the clip-path failing
    // This should be a more efficient method of animation when there are multiple lines
    // self.dataAreaG
    //   .attr('transform', null)
    //   .transition()
    //   .ease(d3.easeLinear)
    //   .duration(1000)
    //   .attr('transform', 'translate(' + (self.x(0) - self.x(1000)) + ')')
    //   .on('end', _ => self.tick(self))
  }

  // By brute force insert all key value pairs into config, overwriting any old values
  updateConfig (newConfig) {
    for (const key in newConfig) {
      this.config[key] = newConfig[key]
    }
  }

  // Reset scales when chart is expanded or collapsed
  resizeChart (expanded) {
    if (expanded) {
      this.config.currentLimit = this.config.expandedLimit
    } else {
      this.config.currentLimit = this.config.collapsedLimit
      this.flags.zoomedIn = false
    }

    // If animations are currently allowed run a nice grow/shrink transition before resuming animation
    if (Object.values(this.flags).every(flag => flag === false)) {
      // Create a nice transition animation before attempting to resume
      this.config.endTime = new Date().getTime()
      this.config.startTime = this.config.endTime - (this.config.currentLimit * 1000)
      this.x.domain([this.config.startTime, this.config.endTime])

      this.draw()
    }
  }

  wipeData () {
    this.data = {}
    this.dataAreaG.selectAll('path')
      .transition()
      .duration(250)
      .attr('transform', 'translate(800,0)')
      .on('end', d => this.tick(this))
  }

  // For pausing the animation cycles to be used by external callers
  // Note the html element takes over the 'this' keyword
  // calling the function using => notation bypasses that problem
  pause () {
    // Stop any any progress animations
    this.xAxisG.selectAll('*')
      .interrupt()
    this.dataAreaG.selectAll('*')
      .interrupt()
    // Stop animations from resuming via another source
    this.flags.externalStop = true
    // Run the animation tick once to trigger state cleaning (disabling currentlyAnimating) 10/15/19
    this.tick(this)
  }

  // For removing the pause put into place by external callers
  // Note the html element takes over the 'this' keyword
  // calling the function using => notation bypasses that problem
  resume () {
    // Currently will jump to live most current time
    this.flags.externalStop = false
    // Reset brush zoom, and then start animation cycles up
    this.flags.zoomedIn = false
    this.flags.rewound = false
    this.config.endTime = new Date().getTime()
    this.config.startTime = this.config.endTime - (this.config.currentLimit * 1000)
    this.x.domain([this.config.startTime, this.config.endTime])

    this.draw()
  }

  rewind () {
    // Stop any any progress animations
    this.xAxisG.selectAll('*')
      .interrupt()
    this.dataAreaG.selectAll('*')
      .interrupt()
      // Stop animations from resuming via another source
    this.flags.rewound = true
    // Run the animation tick once to trigger state cleaning (disabling currentlyAnimating) 10/15/19
    this.tick(this)

    // Move the graph back by N seconds
    this.config.endTime = this.config.endTime - this.config.rewind * 1000
    this.config.startTime = this.config.startTime - this.config.rewind * 1000
    this.x.domain([this.config.startTime, this.config.endTime])

    this.draw()
  }
}
