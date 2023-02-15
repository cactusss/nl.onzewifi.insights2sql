Log data from all your devices directly to a Microsoft SQL database, or use a query to retrieve data from an MS SQL database.
Not only data that is normaly collected by Homey's insights, but data from *all* capabilities, even custom capabilities.

Now also encrypted connections are supported!

Capability data can be logged by 'event' (when it changes) but can also be logged by a schedule (every x minutes). You can chose which capabilities from which devices have to be logged, and if that logging happens by event and/or scheduled.

Devices can easily be filtered by name, zone and capability making it a easy to select the devices you need logging for.

You need a working SQL server, and the SQL account you use must have dbread/dbwrite access to the database you specify. Future version will include an auto setup that will automaticaly create the database and table Insights2SQL needs, for now you need to set them up yourself. You can use the folowing query to create the table:

CREATE TABLE [dbo].[InsightsData](
	[ID] [int] IDENTITY(1,1) NOT NULL,
	[TimeStampSQL] [datetime] NOT NULL,
	[TimeStampEvent] [datetime] NOT NULL,
	[DeviceUri] [nchar](36) NOT NULL,
	[DeviceName] [nvarchar](128) NOT NULL,
	[CapabilityName] [nvarchar](128) NOT NULL,
	[CapabilityData] [nvarchar](128) NOT NULL,
	[LogType] [smaalint] NULL,
PRIMARY KEY CLUSTERED 
(
	[ID] DESC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
) ON [PRIMARY]

Create indexes as you see best fit for your queries

Added an action flow card that can be used to log non device related data. I use it to log notifications to the SQL database. The notifications will be logged with your Homey's name (and URI) and with the CapabilityName from the 'owner' of the notification.

Added a condition flowcard that let's you retrieve data from a MS SQL databse. You can use this to compare the result (this must be a single value of course) to a given value.

** Previous versions (older than version 1.6.2) use a TimedData (Bit) column instead of LogType (smallint), and won't be able to use the Update function. Everything will keep working in legacyMode. The update function will be available as soon as a LogType column added to the SQL table.